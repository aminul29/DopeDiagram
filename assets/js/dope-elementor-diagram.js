(function () {
  var bloomObserver = null;
  var diagramRoots = new Set();
  var resizeTimer = null;
  var rafByRoot = new WeakMap();
  var mutationByRoot = new WeakMap();
  var resizeObserverByRoot = new WeakMap();
  var delayedBuildByRoot = new WeakMap();
  var buildRetryTimerByRoot = new WeakMap();
  var buildRetryCountByRoot = new WeakMap();
  var popupCleanupByRoot = new WeakMap();
  var SVG_NS = "http://www.w3.org/2000/svg";
  var prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isEditorMode() {
    if (
      window.elementorFrontend &&
      typeof window.elementorFrontend.isEditMode === "function" &&
      window.elementorFrontend.isEditMode()
    ) {
      return true;
    }

    return (
      document.body.classList.contains("elementor-editor-active") ||
      document.body.classList.contains("elementor-preview")
    );
  }

  function parseConfig(root) {
    var raw = root.getAttribute("data-ded-config");
    if (!raw) {
      return {};
    }

    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function isAllAtOnceMode(config) {
    return config && config.animationMode === "all_at_once_center_out";
  }

  function getBloomDurationMs(root, config) {
    var configDuration = Number(config && config.bloomDuration);
    if (Number.isFinite(configDuration) && configDuration > 0) {
      return configDuration;
    }

    var cssDuration = window
      .getComputedStyle(root)
      .getPropertyValue("--ded-bloom-duration")
      .trim();
    var parsedCssDuration = parseDelayMs(cssDuration);
    if (parsedCssDuration > 0) {
      return parsedCssDuration;
    }

    return 900;
  }

  function getNodeFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    return target.closest(".ded-node-link");
  }

  function getPopupElements(root) {
    var popup = root.querySelector(".ded-popup");
    if (!popup) {
      return null;
    }

    return {
      popup: popup,
      card: popup.querySelector(".ded-popup-card"),
      link: popup.querySelector(".ded-popup-link"),
      imageWrap: popup.querySelector(".ded-popup-image-wrap"),
      image: popup.querySelector(".ded-popup-image"),
      title: popup.querySelector(".ded-popup-title"),
      description: popup.querySelector(".ded-popup-description"),
    };
  }

  function setNodeExpanded(root, expandedNode) {
    root.querySelectorAll(".ded-node-link[aria-expanded]").forEach(function (node) {
      node.setAttribute("aria-expanded", node === expandedNode ? "true" : "false");
    });
  }

  function positionPopup(root, node, popupElements) {
    if (!popupElements || !popupElements.popup || !popupElements.card) {
      return;
    }

    var popup = popupElements.popup;
    var card = popupElements.card;
    var rootRect = root.getBoundingClientRect();
    var nodeRect = node.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();

    var left = nodeRect.left - rootRect.left + nodeRect.width / 2 - cardRect.width / 2;
    var top = nodeRect.bottom - rootRect.top + 12;

    var minLeft = 8;
    var maxLeft = Math.max(minLeft, rootRect.width - cardRect.width - 8);
    if (left < minLeft) {
      left = minLeft;
    }
    if (left > maxLeft) {
      left = maxLeft;
    }

    if (top + cardRect.height > rootRect.height - 8) {
      top = nodeRect.top - rootRect.top - cardRect.height - 12;
    }
    if (top < 8) {
      top = 8;
    }

    popup.style.left = left + "px";
    popup.style.top = top + "px";
  }

  function closePopup(root) {
    var popupElements = getPopupElements(root);
    if (!popupElements) {
      return;
    }

    popupElements.popup.classList.remove("is-open");
    popupElements.popup.setAttribute("aria-hidden", "true");
    root.__dedPopupPinned = false;
    root.__dedActivePopupNode = null;
    setNodeExpanded(root, null);
  }

  function openPopup(root, node, persistent) {
    var popupElements = getPopupElements(root);
    if (!popupElements || !popupElements.popup || !popupElements.link) {
      return;
    }

    var title = node.getAttribute("data-popup-title") || "";
    var description = node.getAttribute("data-popup-description") || "";
    var image = node.getAttribute("data-popup-image") || "";
    var link = node.getAttribute("data-popup-link") || "";
    var isExternal = node.getAttribute("data-popup-link-external") === "1";
    var nofollow = node.getAttribute("data-popup-link-nofollow") === "1";

    if (popupElements.title) {
      popupElements.title.textContent = title;
    }
    if (popupElements.description) {
      popupElements.description.textContent = description;
      popupElements.description.hidden = description === "";
    }

    if (popupElements.imageWrap && popupElements.image) {
      if (image) {
        popupElements.imageWrap.hidden = false;
        popupElements.image.src = image;
        popupElements.image.alt = title;
      } else {
        popupElements.imageWrap.hidden = true;
        popupElements.image.removeAttribute("src");
        popupElements.image.alt = "";
      }
    }

    if (link) {
      popupElements.link.href = link;
      popupElements.link.classList.remove("is-disabled");
      popupElements.link.setAttribute("tabindex", "0");
      popupElements.link.setAttribute("aria-disabled", "false");
      if (isExternal) {
        popupElements.link.setAttribute("target", "_blank");
      } else {
        popupElements.link.setAttribute("target", "_self");
      }
      var rel = [];
      if (isExternal) {
        rel.push("noopener", "noreferrer");
      }
      if (nofollow) {
        rel.push("nofollow");
      }
      if (rel.length) {
        popupElements.link.setAttribute("rel", rel.join(" "));
      } else {
        popupElements.link.removeAttribute("rel");
      }
    } else {
      popupElements.link.href = "#";
      popupElements.link.classList.add("is-disabled");
      popupElements.link.setAttribute("tabindex", "-1");
      popupElements.link.setAttribute("aria-disabled", "true");
      popupElements.link.setAttribute("target", "_self");
      popupElements.link.removeAttribute("rel");
    }

    popupElements.popup.classList.add("is-open");
    popupElements.popup.setAttribute("aria-hidden", "false");
    positionPopup(root, node, popupElements);

    root.__dedPopupPinned = !!persistent;
    root.__dedActivePopupNode = node;
    setNodeExpanded(root, node);
  }

  function initPopup(root, config) {
    if (!config.enablePopup) {
      closePopup(root);
      return;
    }

    var popupElements = getPopupElements(root);
    if (!popupElements || !popupElements.popup) {
      return;
    }
    if (popupCleanupByRoot.has(root)) {
      return;
    }

    var isTouchDevice =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches;

    var onMouseEnter = function (event) {
      if (isTouchDevice || root.__dedPopupPinned) {
        return;
      }
      var node = getNodeFromTarget(event.target);
      if (!node) {
        return;
      }
      openPopup(root, node, false);
    };
    root.addEventListener(
      "mouseenter",
      onMouseEnter,
      true
    );

    var onMouseLeave = function (event) {
      if (isTouchDevice || root.__dedPopupPinned) {
        return;
      }
      var node = getNodeFromTarget(event.target);
      if (!node) {
        return;
      }
      closePopup(root);
    };
    root.addEventListener(
      "mouseleave",
      onMouseLeave,
      true
    );

    var onFocusIn = function (event) {
      var node = getNodeFromTarget(event.target);
      if (!node || root.__dedPopupPinned) {
        return;
      }
      openPopup(root, node, false);
    };
    root.addEventListener(
      "focusin",
      onFocusIn,
      true
    );

    var onFocusOut = function () {
      if (!root.__dedPopupPinned) {
        closePopup(root);
      }
    };
    root.addEventListener(
      "focusout",
      onFocusOut,
      true
    );

    var onRootClick = function (event) {
      var node = getNodeFromTarget(event.target);
      if (!node) {
        return;
      }
      event.preventDefault();
      if (root.__dedPopupPinned && root.__dedActivePopupNode === node) {
        closePopup(root);
        return;
      }
      openPopup(root, node, true);
    };
    root.addEventListener("click", onRootClick);

    var onRootKeyDown = function (event) {
      var node = getNodeFromTarget(event.target);
      if (!node) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      if (root.__dedPopupPinned && root.__dedActivePopupNode === node) {
        closePopup(root);
        return;
      }

      openPopup(root, node, true);
      var activePopup = getPopupElements(root);
      if (
        activePopup &&
        activePopup.link &&
        !activePopup.link.classList.contains("is-disabled")
      ) {
        activePopup.link.focus();
      }
    };
    root.addEventListener("keydown", onRootKeyDown);

    var onPopupLinkClick = function (event) {
      if (popupElements.link.classList.contains("is-disabled")) {
        event.preventDefault();
      }
    };
    popupElements.link.addEventListener("click", onPopupLinkClick);

    var onDocumentClick = function (event) {
      if (!root.contains(event.target)) {
        closePopup(root);
      }
    };
    document.addEventListener("click", onDocumentClick);

    var onDocumentKeyDown = function (event) {
      if (event.key === "Escape") {
        closePopup(root);
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown);

    popupCleanupByRoot.set(root, function () {
      root.removeEventListener("mouseenter", onMouseEnter, true);
      root.removeEventListener("mouseleave", onMouseLeave, true);
      root.removeEventListener("focusin", onFocusIn, true);
      root.removeEventListener("focusout", onFocusOut, true);
      root.removeEventListener("click", onRootClick);
      root.removeEventListener("keydown", onRootKeyDown);
      popupElements.link.removeEventListener("click", onPopupLinkClick);
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onDocumentKeyDown);
    });
  }

  function getCanvas(root) {
    return root.querySelector(".ded-diagram__canvas");
  }

  function getConnectorSvg(root) {
    return root.querySelector(".ded-connectors-svg");
  }

  function clearConnectorSvg(svg) {
    if (!svg) {
      return;
    }
    svg.textContent = "";
  }

  function isInViewport(element, thresholdRatio) {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    var rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    var viewportW = window.innerWidth || document.documentElement.clientWidth;
    var viewportH = window.innerHeight || document.documentElement.clientHeight;
    var threshold = Number.isFinite(thresholdRatio) ? thresholdRatio : 0;

    var visibleW =
      Math.max(0, Math.min(rect.right, viewportW) - Math.max(rect.left, 0));
    var visibleH =
      Math.max(0, Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0));
    var visibleArea = visibleW * visibleH;
    var totalArea = rect.width * rect.height;

    if (totalArea <= 0) {
      return false;
    }

    return visibleArea / totalArea >= threshold;
  }

  function parseDelayMs(value) {
    if (!value) {
      return 0;
    }

    var parsed = parseFloat(String(value).replace("ms", "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function parseCssPx(value) {
    if (!value) {
      return 0;
    }

    var parsed = parseFloat(String(value).replace("px", "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function updateLayoutScale(root) {
    var canvas = getCanvas(root);
    if (!canvas) {
      return 1;
    }

    var canvasRect = canvas.getBoundingClientRect();
    var canvasSize = Math.min(canvasRect.width || 0, canvasRect.height || 0);
    if (!canvasSize) {
      return 1;
    }

    var styles = window.getComputedStyle(root);
    var configuredSize = parseCssPx(styles.getPropertyValue("--ded-container-size")) || canvasSize;
    var circleSize = parseCssPx(styles.getPropertyValue("--ded-circle-size"));
    var hexSize = parseCssPx(styles.getPropertyValue("--ded-hexagon-size"));
    var circleRadius = parseCssPx(styles.getPropertyValue("--ded-circle-radius"));
    var hexRadius = parseCssPx(styles.getPropertyValue("--ded-hexagon-radius"));
    var halfCircleSpan = circleRadius + circleSize / 2;
    var halfHexSpan = hexRadius + (hexSize * 1.15) / 2;
    var requiredHalfSize = Math.max(configuredSize / 2, halfCircleSpan, halfHexSpan);
    var requiredCanvasSize = requiredHalfSize > 0 ? requiredHalfSize * 2 : configuredSize;

    var scale = canvasSize / requiredCanvasSize;
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = 1;
    }
    scale = Math.min(1, scale);

    var normalizedScale = scale.toFixed(4);
    if (root.__dedLayoutScale !== normalizedScale) {
      root.style.setProperty("--ded-layout-scale", normalizedScale);
      root.__dedLayoutScale = normalizedScale;
    }

    return scale;
  }

  function getNodesInRenderOrder(root) {
    var circles = Array.prototype.slice.call(
      root.querySelectorAll(".ded-layer--circles .ded-node")
    );
    var hexagons = Array.prototype.slice.call(
      root.querySelectorAll(".ded-layer--hexagons .ded-node")
    );
    return circles.concat(hexagons);
  }

  function toCanvasLocalPoint(globalX, globalY, canvasRect) {
    return {
      x: globalX - canvasRect.left,
      y: globalY - canvasRect.top,
    };
  }

  function raySegmentDistance(ux, uy, ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var det = dx * uy - ux * dy;

    if (Math.abs(det) < 0.000001) {
      return null;
    }

    var t = (dx * ay - ax * dy) / det;
    var s = (ux * ay - uy * ax) / det;

    if (t >= 0 && s >= 0 && s <= 1) {
      return t;
    }

    return null;
  }

  function getHexEdgeDistance(ux, uy, width, height) {
    var halfW = width / 2;
    var halfH = height / 2;
    var quarterH = halfH / 2;
    var vertices = [
      { x: 0, y: -halfH },
      { x: halfW, y: -quarterH },
      { x: halfW, y: quarterH },
      { x: 0, y: halfH },
      { x: -halfW, y: quarterH },
      { x: -halfW, y: -quarterH },
    ];

    var minDistance = Infinity;
    for (var i = 0; i < vertices.length; i += 1) {
      var a = vertices[i];
      var b = vertices[(i + 1) % vertices.length];
      var dist = raySegmentDistance(ux, uy, a.x, a.y, b.x, b.y);
      if (dist !== null && dist < minDistance) {
        minDistance = dist;
      }
    }

    if (!Number.isFinite(minDistance)) {
      return Math.min(halfW, halfH);
    }

    return minDistance;
  }

  function formatCoord(value) {
    return Number(value).toFixed(3);
  }

  function createConnectorLine(svg, x1, y1, x2, y2, delayMs, strokeColor) {
    var line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("class", "ded-connector-line");
    line.setAttribute("x1", formatCoord(x1));
    line.setAttribute("y1", formatCoord(y1));
    line.setAttribute("x2", formatCoord(x2));
    line.setAttribute("y2", formatCoord(y2));
    if (strokeColor) {
      line.setAttribute("stroke", strokeColor);
    }

    var safeDelay = Number.isFinite(Number(delayMs)) && Number(delayMs) > 0 ? Number(delayMs) : 0;
    line.style.setProperty("--ded-delay", String(safeDelay) + "ms");

    svg.appendChild(line);

    var totalLength = line.getTotalLength();
    var lengthString = totalLength.toFixed(3);
    line.style.setProperty("--ded-line-length", lengthString);
    line.style.strokeDasharray = lengthString;
    line.style.strokeDashoffset = "0";

    if (prefersReducedMotion) {
      line.style.transition = "none";
    }
  }

  function setConnectorVisibility(root, isVisible) {
    var svg = getConnectorSvg(root);
    if (!svg) {
      return;
    }

    svg.querySelectorAll(".ded-connector-line").forEach(function (line) {
      var len = Number(line.getTotalLength());
      if (!Number.isFinite(len) || len <= 0) {
        return;
      }

      if (!line.style.strokeDasharray) {
        line.style.strokeDasharray = len.toFixed(3);
      }

      line.style.strokeDashoffset = isVisible ? "0" : len.toFixed(3);
    });
  }

  function buildConnectors(root) {
    var config = parseConfig(root);
    var svg = getConnectorSvg(root);
    var canvas = getCanvas(root);
    var editorMode = isEditorMode();
    var allAtOnce = isAllAtOnceMode(config);

    if (!svg || !canvas) {
      clearConnectorSvg(svg);
      return 0;
    }

    updateLayoutScale(root);

    if (config.showConnectors === false) {
      clearConnectorSvg(svg);
      return -1;
    }

    if (!editorMode && !root.classList.contains("is-bloomed")) {
      clearConnectorSvg(svg);
      return 0;
    }

    var canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width || !canvasRect.height) {
      clearConnectorSvg(svg);
      return 0;
    }

    var originX = canvasRect.width / 2;
    var originY = canvasRect.height / 2;
    var strokeColor =
      window.getComputedStyle(root).getPropertyValue("--ded-connector-color").trim() ||
      "#b8c4d2";

    svg.setAttribute("viewBox", "0 0 " + canvasRect.width + " " + canvasRect.height);
    svg.setAttribute("preserveAspectRatio", "none");

    clearConnectorSvg(svg);

    var nodes = getNodesInRenderOrder(root);
    var builtCount = 0;
    nodes.forEach(function (node, index) {
      var shape = node.querySelector(".ded-node-shape");
      if (!shape) {
        return;
      }

      var shapeRect = shape.getBoundingClientRect();
      if (!shapeRect.width || !shapeRect.height) {
        return;
      }

      var nodeCenter = toCanvasLocalPoint(
        shapeRect.left + shapeRect.width / 2,
        shapeRect.top + shapeRect.height / 2,
        canvasRect
      );

      var vx = nodeCenter.x - originX;
      var vy = nodeCenter.y - originY;
      var vecLen = Math.hypot(vx, vy);
      if (vecLen < 0.5) {
        return;
      }

      var ux = vx / vecLen;
      var uy = vy / vecLen;

      var edgeDistance = 0;
      if (node.classList.contains("ded-node--hexagon")) {
        edgeDistance = getHexEdgeDistance(ux, uy, shapeRect.width, shapeRect.height);
      } else {
        edgeDistance = shapeRect.width / 2;
      }

      var x2 = nodeCenter.x - ux * edgeDistance;
      var y2 = nodeCenter.y - uy * edgeDistance;
      var delayValue = window.getComputedStyle(node).getPropertyValue("--ded-delay");
      var delayMs = parseDelayMs(delayValue);
      if (!delayMs && config.staggerDelay) {
        delayMs = index * Number(config.staggerDelay || 0);
      }
      if (allAtOnce) {
        delayMs = 0;
      }

      createConnectorLine(svg, originX, originY, x2, y2, delayMs, strokeColor);
      builtCount += 1;
    });

    return builtCount;
  }

  function scheduleConnectorBuild(root) {
    if (!root) {
      return;
    }

    var scheduled = rafByRoot.get(root);
    if (scheduled) {
      return;
    }

    var frame = window.requestAnimationFrame(function () {
      rafByRoot.delete(root);
      var builtCount = buildConnectors(root);
      var editorMode = isEditorMode();
      var bloomed = root.classList.contains("is-bloomed");

      if (builtCount > 0 || builtCount === -1) {
        var retryTimer = buildRetryTimerByRoot.get(root);
        if (retryTimer) {
          window.clearTimeout(retryTimer);
          buildRetryTimerByRoot.delete(root);
        }
        buildRetryCountByRoot.delete(root);
        return;
      }

      if (!editorMode && !bloomed) {
        return;
      }

      var retryCount = buildRetryCountByRoot.get(root) || 0;
      if (retryCount >= 12) {
        return;
      }

      buildRetryCountByRoot.set(root, retryCount + 1);
      var retryTimer = window.setTimeout(function () {
        scheduleConnectorBuild(root);
      }, 60);
      buildRetryTimerByRoot.set(root, retryTimer);
    });

    rafByRoot.set(root, frame);
  }

  function initConnectorObservers(root) {
    var existing = mutationByRoot.get(root);
    if (existing) {
      existing.disconnect();
      mutationByRoot.delete(root);
    }

    var observer = new MutationObserver(function () {
      scheduleConnectorBuild(root);
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["style", "class", "data-ded-config"],
    });

    var circlesLayer = root.querySelector(".ded-layer--circles");
    var hexLayer = root.querySelector(".ded-layer--hexagons");

    [circlesLayer, hexLayer].forEach(function (layer) {
      if (!layer) {
        return;
      }

      observer.observe(layer, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    });

    mutationByRoot.set(root, observer);

    var existingResizeObserver = resizeObserverByRoot.get(root);
    if (existingResizeObserver) {
      existingResizeObserver.disconnect();
      resizeObserverByRoot.delete(root);
    }

    if ("ResizeObserver" in window) {
      var resizeObserver = new ResizeObserver(function () {
        scheduleConnectorBuild(root);
      });

      resizeObserver.observe(root);

      var canvas = getCanvas(root);
      if (canvas) {
        resizeObserver.observe(canvas);
      }

      resizeObserverByRoot.set(root, resizeObserver);
    }
  }

  function teardownDiagram(root) {
    var frame = rafByRoot.get(root);
    if (frame) {
      window.cancelAnimationFrame(frame);
      rafByRoot.delete(root);
    }

    var observer = mutationByRoot.get(root);
    if (observer) {
      observer.disconnect();
      mutationByRoot.delete(root);
    }

    var resizeObserver = resizeObserverByRoot.get(root);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserverByRoot.delete(root);
    }

    var delayedTimer = delayedBuildByRoot.get(root);
    if (delayedTimer) {
      window.clearTimeout(delayedTimer);
      delayedBuildByRoot.delete(root);
    }

    var retryTimer = buildRetryTimerByRoot.get(root);
    if (retryTimer) {
      window.clearTimeout(retryTimer);
      buildRetryTimerByRoot.delete(root);
    }
    buildRetryCountByRoot.delete(root);

    var popupCleanup = popupCleanupByRoot.get(root);
    if (popupCleanup) {
      popupCleanup();
      popupCleanupByRoot.delete(root);
    }

    root.style.removeProperty("--ded-layout-scale");
    delete root.__dedLayoutScale;
  }

  function bloom(root) {
    root.classList.add("is-bloomed");
    setConnectorVisibility(root, true);
    scheduleConnectorBuild(root);

    var config = parseConfig(root);
    var allAtOnce = isAllAtOnceMode(config);
    var durationMs = getBloomDurationMs(root, config);
    var staggerMs = Number(config.staggerDelay);
    if (!Number.isFinite(staggerMs) || staggerMs < 0) {
      staggerMs = 0;
    }

    var nodeCount = getNodesInRenderOrder(root).length;
    var settleDelay = allAtOnce ? durationMs + 60 : durationMs + nodeCount * staggerMs + 60;

    var existingDelayedTimer = delayedBuildByRoot.get(root);
    if (existingDelayedTimer) {
      window.clearTimeout(existingDelayedTimer);
    }
    var delayedTimer = window.setTimeout(function () {
      scheduleConnectorBuild(root);
    }, settleDelay);
    delayedBuildByRoot.set(root, delayedTimer);
  }

  function initBloom(root) {
    if (prefersReducedMotion) {
      bloom(root);
      return;
    }

    if (!("IntersectionObserver" in window)) {
      bloom(root);
      return;
    }

    if (!bloomObserver) {
      bloomObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              bloom(entry.target);
              bloomObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
      );
    }

    bloomObserver.observe(root);
  }

  function setCssVars(root, config) {
    var duration = Number(config.bloomDuration);
    if (Number.isFinite(duration) && duration > 0) {
      root.style.setProperty("--ded-bloom-duration", duration + "ms");
    }

    if (isAllAtOnceMode(config)) {
      root.setAttribute("data-ded-animation", "all-at-once");
      root.style.setProperty("--ded-mode-delay", "0ms");
    } else {
      root.setAttribute("data-ded-animation", "stagger");
      root.style.removeProperty("--ded-mode-delay");
    }
  }

  function initDiagram(root, forceReinit) {
    if (!root) {
      return;
    }

    if (forceReinit) {
      teardownDiagram(root);
      root.dataset.dedReady = "0";
      root.classList.remove("is-bloomed");
    }

    if (root.dataset.dedReady === "1") {
      scheduleConnectorBuild(root);
      return;
    }

    root.dataset.dedReady = "1";
    var config = parseConfig(root);
    var editorMode = isEditorMode();
    var allAtOnce = isAllAtOnceMode(config);
    setCssVars(root, config);
    updateLayoutScale(root);
    initPopup(root, config);
    if (editorMode) {
      root.classList.add("is-bloomed");
    }
    if (editorMode) {
      buildConnectors(root);
    }
    initConnectorObservers(root);
    diagramRoots.add(root);
    if (editorMode) {
      scheduleConnectorBuild(root);
    }

    var existingDelayedTimer = delayedBuildByRoot.get(root);
    if (existingDelayedTimer) {
      window.clearTimeout(existingDelayedTimer);
    }
    var delayedTimer = window.setTimeout(function () {
      if (!editorMode && !root.classList.contains("is-bloomed") && isInViewport(root, 0.12)) {
        bloom(root);
      } else {
        scheduleConnectorBuild(root);
      }
    }, 140);
    delayedBuildByRoot.set(root, delayedTimer);

    if (editorMode) {
      setConnectorVisibility(root, true);
      scheduleConnectorBuild(root);
    } else {
      initBloom(root);
    }

    var nodes = getNodesInRenderOrder(root);
    if (allAtOnce) {
      nodes.forEach(function (node) {
        node.style.setProperty("--ded-delay", "0ms");
      });
    } else {
      nodes.forEach(function (node) {
        node.style.removeProperty("--ded-delay");
      });
    }
  }

  function getScopeElement(scope) {
    if (!scope) {
      return null;
    }

    if (scope.nodeType === 1) {
      return scope;
    }

    if (scope[0] && scope[0].nodeType === 1) {
      return scope[0];
    }

    if (scope.jquery && typeof scope.get === "function") {
      return scope.get(0) || null;
    }

    return null;
  }

  function boot(scope, forceReinit) {
    var root = scope || document;

    if (root.classList && root.classList.contains("ded-diagram")) {
      initDiagram(root, !!forceReinit);
      return;
    }

    if (root.querySelectorAll) {
      root.querySelectorAll(".ded-diagram").forEach(function (diagram) {
        initDiagram(diagram, !!forceReinit);
      });
    }
  }

  if (window.elementorFrontend && window.elementorFrontend.hooks) {
    window.elementorFrontend.hooks.addAction(
      "frontend/element_ready/dope_elementor_flower_diagram.default",
      function ($scope) {
        var scopeElement = getScopeElement($scope);
        boot(scopeElement, true);
      }
    );
  }

  window.addEventListener("resize", function () {
    diagramRoots.forEach(function (root) {
      if (root.__dedActivePopupNode && root.__dedPopupPinned) {
        var popupElements = getPopupElements(root);
        if (popupElements && popupElements.popup.classList.contains("is-open")) {
          positionPopup(root, root.__dedActivePopupNode, popupElements);
        }
      }
    });

    if (resizeTimer) {
      window.clearTimeout(resizeTimer);
    }

    resizeTimer = window.setTimeout(function () {
      diagramRoots.forEach(function (root) {
        scheduleConnectorBuild(root);
      });
    }, 120);
  });
  window.addEventListener(
    "scroll",
    function () {
      diagramRoots.forEach(function (root) {
        if (root.__dedActivePopupNode && root.__dedPopupPinned) {
          var popupElements = getPopupElements(root);
          if (popupElements && popupElements.popup.classList.contains("is-open")) {
            positionPopup(root, root.__dedActivePopupNode, popupElements);
          }
        }
      });
    },
    { passive: true }
  );
  window.addEventListener("load", function () {
    diagramRoots.forEach(function (root) {
      scheduleConnectorBuild(root);
      if (!root.classList.contains("is-bloomed") && isInViewport(root, 0.12)) {
        bloom(root);
      }
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot(document, false);
    });
  } else {
    boot(document, false);
  }
})();
