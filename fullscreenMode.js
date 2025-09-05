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

    // Handle soundboard
    let soundboardOriginalParent = null;
    let soundboardNextSibling = null;

    function isEphemeral(node) {
      return (
        node?.classList?.contains("binger-ephemeral") ||
        node?.classList?.contains("binger-pin-emoji")
      );
    }

    document.addEventListener("fullscreenchange", () => {
      const isFS = !!document.fullscreenElement;
      const vjsContainer = document.querySelector(".video-js.vjs-fullscreen") || document.querySelector(".video-js");
      const video = vjsContainer?.querySelector("video");

      if (!vjsContainer || !video) {
        console.warn("[Binger] fullscreenchange: no vjsContainer or video");
        return;
      }

      if (isFS) {
        document.querySelectorAll(".binger-ephemeral, .binger-pin-emoji").forEach(el => el.remove());

        // Find call iframe
        iframe = document.querySelector("iframe.binger-call-iframe");
        if (iframe) {
          iframeOriginalParent = iframe.parentNode;
          iframeOriginalStyles = iframe.getAttribute("style");

          // Skip ephemeral siblings
          let sibling = iframe.nextSibling;
          while (sibling && isEphemeral(sibling)) {
            sibling = sibling.nextSibling;
          }
          iframeNextSibling = sibling;
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

        // Create videoRegion (70%)
        videoRegion = document.createElement("div");
        videoRegion.id = "binger-video-region";
        Object.assign(videoRegion.style, {
          height: "70%",
          width: "100%",
          display: "flex",
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          overflow: "hidden"
        });

        // Move all children into videoRegion
        [...vjsContainer.children].forEach((child) => {
          if (child !== videoRegion && !isEphemeral(child)) {
            videoRegion.appendChild(child);
          }
        });
        vjsContainer.appendChild(videoRegion);

        // Stretch video
        Object.assign(video.style, {
          width: "100%",
          height: "100%",
          objectFit: "contain",
        });

        // Create Overlay & Call App & Soundboard wrapper (30%)
        const fsRow = document.createElement("div");
        fsRow.id = "binger-fullscreen-row";
        Object.assign(fsRow.style, {
          display: "flex",
          flexDirection: "row",
          width: "100%",
          height: "30%",
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

        // Append the soundboard to the right of overlay
        const soundboard = document.getElementById("bingerSoundboard");
        if (soundboard) {
          if (!soundboardOriginalParent) {
            soundboardOriginalParent = soundboard.parentNode;
            // Skip ephemeral siblings
            let sbSibling = soundboard.nextSibling;
            while (sbSibling && isEphemeral(sbSibling)) {
              sbSibling = sbSibling.nextSibling;
            }
            soundboardNextSibling = sbSibling;
          }

          soundboard.classList.add("fullscreen");
          fsRow.appendChild(soundboard);
        }

        // Make Overlay fullscreen (iframe already is)
        overlay.classList.add("fullscreen");

        // Setup restore function
        restoreFn = () => {
          console.log("[Binger] Restoring fullscreen layout");

          // Move back overlay
          if (overlayOriginalParent) {                           
            let ovSibling = overlayNextSibling;
            while (ovSibling && isEphemeral(ovSibling)) {
              ovSibling = ovSibling.nextSibling;
            }
            overlayOriginalParent.insertBefore(overlay, ovSibling);
          } 

          // Move back soundboard
          const soundboard = document.getElementById("bingerSoundboard");
          if (soundboard && soundboardOriginalParent) {
            soundboard.classList.remove("fullscreen");
            let sbSiblingRestore = soundboardNextSibling;
            while (sbSiblingRestore && isEphemeral(sbSiblingRestore)) {
              sbSiblingRestore = sbSiblingRestore.nextSibling;
            }
            soundboardOriginalParent.insertBefore(soundboard, sbSiblingRestore);
          }

          // Move back video children
          const currentVideoRegion = document.getElementById("binger-video-region");
          if (currentVideoRegion) {
            while (currentVideoRegion.firstChild) {
              const child = currentVideoRegion.firstChild;
              if (!isEphemeral(child)) {
                vjsContainer.insertBefore(child, currentVideoRegion);
              } else {
                child.remove(); // kill floating emoji
              }
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

              let ifSiblingRestore = iframeNextSibling;
              while (ifSiblingRestore && isEphemeral(ifSiblingRestore)) {
                ifSiblingRestore = ifSiblingRestore.nextSibling;
              }
              iframeOriginalParent.insertBefore(newIframe, ifSiblingRestore);
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
        document.querySelectorAll(".binger-ephemeral, .binger-pin-emoji").forEach(el => el.remove());
        
        overlay.classList.remove("fullscreen");
        console.log("[Binger] Exited fullscreen");

        if (restoreFn) {
          restoreFn();
        } else {
          // Emergency fallback if restoreFn was not defined
          console.warn("[Binger] restoreFn missing — attempting manual cleanup");

          if (overlayOriginalParent) {
            let ovSibling = overlayNextSibling;
            while (ovSibling && isEphemeral(ovSibling)) {
              ovSibling = ovSibling.nextSibling;
            }
            overlayOriginalParent.insertBefore(overlay, ovSibling);
          }

          // Move back soundboard
          const soundboard = document.getElementById("bingerSoundboard");
          if (soundboard && soundboardOriginalParent) {
            soundboard.classList.remove("fullscreen");
            let sbSiblingRestore = soundboardNextSibling;
            while (sbSiblingRestore && isEphemeral(sbSiblingRestore)) {
              sbSiblingRestore = sbSiblingRestore.nextSibling;
            }
            soundboardOriginalParent.insertBefore(soundboard, sbSiblingRestore);
          }

          const currentVideoRegion = document.getElementById("binger-video-region");
          const currentWrapper = document.getElementById("binger-wrapper");

          if (currentVideoRegion) {
            while (currentVideoRegion.firstChild) {
              const child = currentVideoRegion.firstChild;
              if (!isEphemeral(child)) {
                vjsContainer.insertBefore(child, currentVideoRegion);
              } else {
                child.remove(); // kill floating emoji
              }
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

              let ifSiblingRestore = iframeNextSibling;
              while (ifSiblingRestore && isEphemeral(ifSiblingRestore)) {
                ifSiblingRestore = ifSiblingRestore.nextSibling;
              }
              iframeOriginalParent.insertBefore(newIframe, ifSiblingRestore);
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
