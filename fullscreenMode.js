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
        overlay.classList.add("fullscreen");
        
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

        // Create videoRegion (60%)
        videoRegion = document.createElement("div");
        videoRegion.id = "binger-video-region";
        Object.assign(videoRegion.style, {
          height: "60%",
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

        // Create Overlay wrapper (40%)
        wrapper = document.createElement("div");
        wrapper.id = "binger-wrapper";
        Object.assign(wrapper.style, {
          height: "40%",
          width: "100%",
          maxWidth: "600px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          zIndex: "999999",
        });
        vjsContainer.appendChild(wrapper);

        wrapper.appendChild(overlay);   

        // Setup restore function
        restoreFn = () => {
          console.log("[Binger] 🧹 Restoring fullscreen layout");

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

          if (currentWrapper) currentWrapper.remove();

          vjsContainer.removeAttribute("style");
          video.removeAttribute("style");

          document.documentElement.style.height = "";
          document.body.style.height = "";

          vjsContainer.querySelectorAll(".vjs-tech, .vjs-poster")
            .forEach((el) => el.removeAttribute("style"));

          if (typeof video.player === "function") {
            setTimeout(() => video.player().resize?.(), 0);
          }
        }
      }
    });
  };
})();
