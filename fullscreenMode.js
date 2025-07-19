// fullscreenMode.js


(function () {
  window.attachFullscreenListener = function attachFullscreenListener(
    overlaySelector = "#bingerOverlay"
  ) {
    const overlay = document.querySelector(overlaySelector);
    if (!overlay) {
      console.warn("[Binger] overlay not found, fullscreen hook skipped");
      return;
    }


    // Remember overlay’s home 
    const overlayOriginalParent = overlay.parentNode;           
    const overlayNextSibling = overlay.nextSibling;  
    
    // Handle iframe video app
    let iframe = null;
    let iframeOriginalParent = null;
    let iframeNextSibling = null;
    let iframeOriginalStyles = null;

    let wrapper = null;
    let videoRegion = null;
    let restoreFn = null;

    let originalVJSStyles = null;
    let originalVideoStyles = null;

    document.addEventListener("fullscreenchange", () => {
      const isFS = !!document.fullscreenElement;
      const vjsContainer = document.querySelector(".video-js.vjs-fullscreen") || document.querySelector(".video-js");
      const video = vjsContainer?.querySelector("video");

      if (!vjsContainer || !video) {
        console.warn("[Binger] fullscreenchange: no vjsContainer or video");
        return;
      }

      if (isFS) {
        // Find call iframe
        iframe = document.querySelector("iframe.binger-call-iframe");
        if (iframe) {
          iframeOriginalParent = iframe.parentNode;
          iframeNextSibling = iframe.nextSibling;
          iframeOriginalStyles = iframe.getAttribute("style");
        }

        console.log("[Binger] 🎥 Entered fullscreen");

        if (document.getElementById("binger-video-region")) {
          console.log("[Binger] Already patched — skipping");
          return;
        }

        // Save styles
        originalVJSStyles = vjsContainer.getAttribute("style");
        originalVideoStyles = video.getAttribute("style");

        // Set up base layout
        document.documentElement.style.height = "100%";
        document.body.style.height = "100%";

        Object.assign(vjsContainer.style, {
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
        });

        // Create videoRegion (65%)
        videoRegion = document.createElement("div");
        videoRegion.id = "binger-video-region";
        Object.assign(videoRegion.style, {
          height: "65%",
          width: "100%",
          display: "flex",
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        });

        // Move all children into videoRegion
        [...vjsContainer.children].forEach((child) => {
          if (child !== videoRegion) videoRegion.appendChild(child);
        });
        vjsContainer.appendChild(videoRegion);

        // Stretch video
        Object.assign(video.style, {
          width: "100%",
          height: "100%",
          objectFit: "contain",
        });

        // Create Overlay & Call App wrapper (35%)
        const fsRow = document.createElement("div");
        fsRow.id = "binger-fullscreen-row";
        Object.assign(fsRow.style, {
          display: "flex",
          flexDirection: "row",
          width: "100%",
          height: "35%",
          justifyContent: "center",
          alignItems: "stretch",
          gap: "12px"
        });
        vjsContainer.appendChild(fsRow);

        // Create Overlay wrapper inside the row for layout control
        wrapper = document.createElement("div");
        wrapper.id = "binger-wrapper";
        Object.assign(wrapper.style, {
          height: "100%",
          width: "660px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          zIndex: "999999",
          flexShrink: 1,
        });

        // Recreate iframe and move it along with overlay into the right wrappers
        if (iframe) {
          const roomId = new URL(iframe.src).searchParams.get("roomId");
          const wasHidden = iframe.classList.contains("binger-call-hidden");

          iframe.remove();

          const newIframe = document.createElement("iframe");
          newIframe.src = chrome.runtime.getURL(`call.html?roomId=${roomId}`);
          newIframe.className = "binger-call-iframe fullscreen";
          // Preserve hidden state if any
          if (wasHidden) newIframe.classList.add("binger-call-hidden");
          newIframe.allow = "camera; microphone; autoplay; fullscreen";

          // Load current mic and cam states to iframe
          newIframe.onload = () => {
            const { camOn, micOn } = window.BINGER.camMicState;
            newIframe.contentWindow.postMessage(
              { type: "restoreCamMic", camOn, micOn },
              "*"
            );
          };

          fsRow.prepend(newIframe);
          iframe = newIframe;

          // Broadcast to other user to sync
          chrome.runtime.sendMessage({
            command: "broadcastCallReset",
            roomId   
          });
          
          // Sync back to sessionMode.js if it's tracking iframe globally
          if (typeof window.bingerSetCallIframe === "function") {
            window.bingerSetCallIframe(newIframe);
          }
        }

        fsRow.appendChild(wrapper);
        wrapper.appendChild(overlay);

        // Make Overlay fullscreen (iframe already is)
        overlay.classList.add("fullscreen");

        // Setup restore function
        restoreFn = () => {
          console.log("[Binger] Restoring fullscreen layout");

          // Move back overlay
          if (overlayOriginalParent) {                           
            overlayOriginalParent.insertBefore(
              overlay,
              overlayNextSibling
            );
          } 

          // Move back video children
          const currentVideoRegion = document.getElementById("binger-video-region");
          if (currentVideoRegion) {
            while (currentVideoRegion.firstChild) {
              vjsContainer.insertBefore(currentVideoRegion.firstChild, currentVideoRegion);
            }
            currentVideoRegion.remove();
          }

          // Remove fullscreen row (which contains iframe + wrapper)
          const currentFSRow = document.getElementById("binger-fullscreen-row");
          if (currentFSRow) currentFSRow.remove();

          // Remove wrapper
          const currentWrapper = document.getElementById("binger-wrapper");
          if (currentWrapper) currentWrapper.remove();

          // Restore styles
          if (originalVJSStyles !== null) {
            vjsContainer.setAttribute("style", originalVJSStyles);
          } else {
            vjsContainer.removeAttribute("style");
          }

          if (originalVideoStyles !== null) {
            video.setAttribute("style", originalVideoStyles);
          } else {
            video.removeAttribute("style");
          }

          document.documentElement.style.height = "";
          document.body.style.height = "";

          vjsContainer.querySelectorAll(".vjs-tech, .vjs-poster")
            .forEach((el) => el.removeAttribute("style"));

          if (typeof video.player === "function") {
            setTimeout(() => video.player().resize?.(), 0);
          }

          // Recreate iframe in original position
          if (iframeOriginalParent) {
            const roomId = (() => {
              try {
                return new URL(iframe?.src).searchParams.get("roomId");
              } catch {
                console.warn("[Binger] Failed to extract roomId from exiting iframe.");
                return null;
              }
            })();

            const wasHidden = iframe?.classList.contains("binger-call-hidden");
            iframe?.remove();

            if (roomId) {
              const newIframe = document.createElement("iframe");
              newIframe.src = chrome.runtime.getURL(`call.html?roomId=${roomId}`);
              newIframe.className = "binger-call-iframe";
              if (wasHidden) newIframe.classList.add("binger-call-hidden");
              newIframe.allow = "camera; microphone; autoplay; fullscreen";

              // Restore inline styles for proper left position
              if (iframeOriginalStyles) {
                newIframe.setAttribute("style", iframeOriginalStyles);
              } else {
                newIframe.removeAttribute("style");
              }

              // Load current mic and cam states to iframe
              newIframe.onload = () => {
                const { camOn, micOn } = window.BINGER.camMicState;
                newIframe.contentWindow.postMessage(
                  { type: "restoreCamMic", camOn, micOn },
                  "*"
                );
              };

              iframeOriginalParent.insertBefore(newIframe, iframeNextSibling);
              iframe = newIframe;

              // Broadcast to other user to sync
              chrome.runtime.sendMessage({
                command: "broadcastCallReset",
                roomId   
              });

              // Sync back to sessionMode.js
              if (typeof window.bingerSetCallIframe === "function") {
                window.bingerSetCallIframe(newIframe);
              }
            }
          }

          // Reset refs
          wrapper = null;
          videoRegion = null;
          restoreFn = null;
          originalVJSStyles = null;
          originalVideoStyles = null;
        };
      }



      // EXIT FULLSCREEN 
      else {
        overlay.classList.remove("fullscreen");
        console.log("[Binger] Exited fullscreen");

        if (restoreFn) {
          restoreFn();
        } else {
          // Emergency fallback if restoreFn was not defined
          console.warn("[Binger] restoreFn missing — attempting manual cleanup");

          if (overlayOriginalParent) {
            overlayOriginalParent.insertBefore(overlay, overlayNextSibling);
          }

          const currentVideoRegion = document.getElementById("binger-video-region");
          const currentWrapper = document.getElementById("binger-wrapper");

          if (currentVideoRegion) {
            while (currentVideoRegion.firstChild) {
              vjsContainer.insertBefore(currentVideoRegion.firstChild, currentVideoRegion);
            }
            currentVideoRegion.remove();
          }

          // Remove fullscreen row wrapper (which contains both iframe + overlay wrapper)
          const currentFSRow = document.getElementById("binger-fullscreen-row");
          if (currentFSRow) currentFSRow.remove();

          vjsContainer.removeAttribute("style");
          video.removeAttribute("style");

          document.documentElement.style.height = "";
          document.body.style.height = "";

          vjsContainer.querySelectorAll(".vjs-tech, .vjs-poster")
            .forEach((el) => el.removeAttribute("style"));

          if (typeof video.player === "function") {
            setTimeout(() => video.player().resize?.(), 0);
          }

          // Recreate iframe in original position
          if (iframeOriginalParent) {
            const roomId = (() => {
              try {
                return new URL(iframe?.src).searchParams.get("roomId");
              } catch {
                console.warn("[Binger] Failed to extract roomId from exiting iframe.");
                return null;
              }
            })();

            const wasHidden = iframe?.classList.contains("binger-call-hidden");
            iframe?.remove();

            if (roomId) {
              const newIframe = document.createElement("iframe");
              newIframe.src = chrome.runtime.getURL(`call.html?roomId=${roomId}`);
              newIframe.className = "binger-call-iframe";
              if (wasHidden) newIframe.classList.add("binger-call-hidden");
              newIframe.allow = "camera; microphone; autoplay; fullscreen";

              // Restore inline styles for proper left position
              if (iframeOriginalStyles) {
                newIframe.setAttribute("style", iframeOriginalStyles);
              } else {
                newIframe.removeAttribute("style");
              }

              // Load current mic and cam states to iframe
              newIframe.onload = () => {
                const { camOn, micOn } = window.BINGER.camMicState;
                newIframe.contentWindow.postMessage(
                  { type: "restoreCamMic", camOn, micOn },
                  "*"
                );
              };

              iframeOriginalParent.insertBefore(newIframe, iframeNextSibling);
              iframe = newIframe;

              // Broadcast to other user to sync
              chrome.runtime.sendMessage({
                command: "broadcastCallReset",
                roomId   
              });

              // Sync back to sessionMode.js
              if (typeof window.bingerSetCallIframe === "function") {
                window.bingerSetCallIframe(newIframe);
              }
            }
          }

        }
      }
    });
  };
})();
