(function () {
  var tooltipEl = null;
  var bloomObserver = null;
  var diagramRoots = new Set();
  var resizeTimer = null;
  var rafByRoot = new WeakMap();
  var mutationByRoot = new WeakMap();
  var resizeObserverByRoot = new WeakMap();
  var delayedBuildByRoot = new WeakMap();
  var buildRetryTimerByRoot = new WeakMap();
  var buildRetryCountByRoot = new WeakMap();
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

  function ensureTooltip() {
    if (tooltipEl && document.body.contains(tooltipEl)) {
      return tooltipEl;
    }

    tooltipEl = document.querySelector(".ded-tooltip");
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "ded-tooltip";
      tooltipEl.setAttribute("role", "tooltip");
      document.body.appendChild(tooltipEl);
    }

    return tooltipEl;
  }

  function hideTooltip() {
    var tooltip = ensureTooltip();
    tooltip.classList.remove("is-visible");
  }

  function showTooltip(target, text) {
    if (!text) {
      return;
    }

    var tooltip = ensureTooltip();
    tooltip.textContent = text;

    var rect = target.getBoundingClientRect();
    var top = rect.top + window.scrollY - tooltip.offsetHeight - 10;
    var left = rect.left + window.scrollX + rect.width / 2 - tooltip.offsetWidth / 2;

    if (left < 8) {
      left = 8;
    }

    var maxLeft = window.scrollX + window.innerWidth - tooltip.offsetWidth - 8;
    if (left > maxLeft) {
      left = maxLeft;
    }

    if (top < window.scrollY + 8) {
      top = rect.bottom + window.scrollY + 10;
    }

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    tooltip.classList.add("is-visible");
  }

  function getNodeFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    return target.closest(".ded-node-link");
  }

  function initTooltips(root, config) {
    if (!config.showTooltips) {
      return;
    }

    root.addEventListener(
      "mouseenter",
      function (event) {
        var node = getNodeFromTarget(event.target);
        if (!node) {
          return;
        }

        var text = node.getAttribute("data-tooltip");
        if (text) {
          showTooltip(node, text);
        }
      },
      true
    );

    root.addEventListener(
      "mouseleave",
      function (event) {
        var node = getNodeFromTarget(event.target);
        if (!node) {
          return;
        }
        hideTooltip();
      },
      true
    );

    root.addEventListener(
      "focusin",
      function (event) {
        var node = getNodeFromTarget(event.target);
        if (!node) {
          return;
        }

        var text = node.getAttribute("data-tooltip");
        if (text) {
          showTooltip(node, text);
        }
      },
      true
    );

    root.addEventListener(
      "focusout",
      function () {
        hideTooltip();
      },
      true
    );
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

    line.style.setProperty("--ded-delay", String(delayMs) + "ms");

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

    if (!svg || !canvas) {
      clearConnectorSvg(svg);
      return 0;
    }

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
  }

  function bloom(root) {
    root.classList.add("is-bloomed");
    setConnectorVisibility(root, true);
    scheduleConnectorBuild(root);

    var config = parseConfig(root);
    var durationMs = getBloomDurationMs(root, config);
    var staggerMs = Number(config.staggerDelay);
    if (!Number.isFinite(staggerMs) || staggerMs < 0) {
      staggerMs = 0;
    }

    var nodeCount = getNodesInRenderOrder(root).length;
    var settleDelay = durationMs + nodeCount * staggerMs + 60;

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
    setCssVars(root, config);
    initTooltips(root, config);
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
    hideTooltip();

    if (resizeTimer) {
      window.clearTimeout(resizeTimer);
    }

    resizeTimer = window.setTimeout(function () {
      diagramRoots.forEach(function (root) {
        scheduleConnectorBuild(root);
      });
    }, 120);
  });
  window.addEventListener("scroll", hideTooltip, { passive: true });
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
