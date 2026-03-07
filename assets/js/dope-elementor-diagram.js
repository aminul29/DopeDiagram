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
  var elementorReadyHookBound = false;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var POPUP_NODE_SELECTOR =
    ".ded-layer--circles .ded-node-link, .ded-layer--hexagons .ded-node-link";
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

  function getPopupNodes(root) {
    return Array.prototype.slice.call(root.querySelectorAll(POPUP_NODE_SELECTOR));
  }

  function getNodeFromTarget(root, target) {
    if (!(target instanceof Element)) {
      return null;
    }

    var node = target.closest(".ded-node-link");
    if (!node || !root.contains(node) || !node.matches(POPUP_NODE_SELECTOR)) {
      return null;
    }

    return node;
  }

  function parseNodePopupContent(node) {
    if (!node) {
      return {};
    }

    var raw = node.getAttribute("data-popup-content");
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

  function getPopupElements(root) {
    var popup = root.querySelector(".ded-popup");
    if (!popup) {
      return null;
    }

    return {
      popup: popup,
      card: popup.querySelector(".ded-popup-card"),
      imageWrap: popup.querySelector(".ded-popup-image-wrap"),
      image: popup.querySelector(".ded-popup-image"),
      title: popup.querySelector(".ded-popup-title"),
      description: popup.querySelector(".ded-popup-description"),
      primaryLink: popup.querySelector(".ded-popup-primary-link"),
      tableWrap: popup.querySelector(".ded-popup-table-wrap"),
      tableBody: popup.querySelector(".ded-popup-table-body"),
    };
  }

  function clearPopupDynamicContent(popupElements) {
    if (!popupElements || !popupElements.tableBody) {
      return;
    }

    popupElements.tableBody.textContent = "";
  }

  function normalizeLinkData(linkData) {
    if (!linkData || typeof linkData !== "object") {
      return {
        url: "",
        isExternal: false,
        nofollow: false,
        customAttributes: "",
      };
    }

    return {
      url: typeof linkData.url === "string" ? linkData.url : "",
      isExternal: !!linkData.is_external || !!linkData.isExternal,
      nofollow: !!linkData.nofollow,
      customAttributes:
        typeof linkData.custom_attributes === "string"
          ? linkData.custom_attributes
          : typeof linkData.customAttributes === "string"
            ? linkData.customAttributes
            : "",
    };
  }

  function resetLinkElement(linkElement) {
    if (!linkElement) {
      return;
    }

    linkElement.href = "#";
    linkElement.hidden = true;
    linkElement.classList.add("is-disabled");
    linkElement.setAttribute("tabindex", "-1");
    linkElement.setAttribute("aria-disabled", "true");
    linkElement.setAttribute("target", "_self");
    linkElement.removeAttribute("rel");

    if (Array.isArray(linkElement.__dedCustomAttrNames)) {
      linkElement.__dedCustomAttrNames.forEach(function (attributeName) {
        if (attributeName) {
          linkElement.removeAttribute(attributeName);
        }
      });
    }

    linkElement.__dedCustomAttrNames = [];
  }

  function applyCustomAttributes(linkElement, customAttributes) {
    if (!linkElement || !customAttributes) {
      return;
    }

    customAttributes.split(",").forEach(function (pair) {
      var trimmedPair = pair.trim();
      if (!trimmedPair) {
        return;
      }

      var parts = trimmedPair.split("|");
      var rawName = (parts[0] || "").trim();
      if (!rawName || !/^[a-zA-Z_:][a-zA-Z0-9:._-]*$/.test(rawName)) {
        return;
      }

      var value = parts.slice(1).join("|").trim();
      linkElement.setAttribute(rawName, value);
      linkElement.__dedCustomAttrNames.push(rawName);
    });
  }

  function applyLinkData(linkElement, linkData) {
    if (!linkElement) {
      return false;
    }

    resetLinkElement(linkElement);

    var normalized = normalizeLinkData(linkData);
    if (!normalized.url) {
      return false;
    }

    linkElement.href = normalized.url;
    linkElement.hidden = false;
    linkElement.classList.remove("is-disabled");
    linkElement.setAttribute("tabindex", "0");
    linkElement.setAttribute("aria-disabled", "false");
    linkElement.setAttribute("target", normalized.isExternal ? "_blank" : "_self");

    var rel = [];
    if (normalized.isExternal) {
      rel.push("noopener", "noreferrer");
    }
    if (normalized.nofollow) {
      rel.push("nofollow");
    }

    if (rel.length) {
      linkElement.setAttribute("rel", rel.join(" "));
    }

    applyCustomAttributes(linkElement, normalized.customAttributes);

    return true;
  }

  function createPopupTableLinkCell(row, labelText) {
    var cell = document.createElement("td");
    cell.className = "ded-popup-table-cell ded-popup-table-cell--link";
    cell.setAttribute("data-label", labelText || "");

    var linkData = normalizeLinkData(row && row.link_url);
    if (!linkData.url) {
      cell.textContent = row && row.link_label ? row.link_label : "";
      return cell;
    }

    var link = document.createElement("a");
    link.className = "ded-popup-table-link";
    link.textContent = row.link_label || linkData.url;
    applyLinkData(link, linkData);
    cell.appendChild(link);

    return cell;
  }

  function renderPopupTableRows(popupElements, tableRows) {
    if (!popupElements || !popupElements.tableWrap || !popupElements.tableBody) {
      return;
    }

    clearPopupDynamicContent(popupElements);

    if (!Array.isArray(tableRows) || !tableRows.length) {
      popupElements.tableWrap.hidden = true;
      return;
    }

    var hasVisibleRow = false;
    var tableHeaders = popupElements.tableWrap.querySelectorAll("th");
    var researchLabel = tableHeaders[0] ? tableHeaders[0].textContent.trim() : "";
    var linkLabelText = tableHeaders[1] ? tableHeaders[1].textContent.trim() : "";

    tableRows.forEach(function (row) {
      if (!row || typeof row !== "object") {
        return;
      }

      var researchText =
        typeof row.research_text === "string" ? row.research_text.trim() : "";
      var linkLabel = typeof row.link_label === "string" ? row.link_label.trim() : "";
      var linkData = normalizeLinkData(row.link_url);

      if (!researchText && !linkLabel && !linkData.url) {
        return;
      }

      var tableRow = document.createElement("tr");
      tableRow.className = "ded-popup-table-row";

      var researchCell = document.createElement("td");
      researchCell.className = "ded-popup-table-cell ded-popup-table-cell--research";
      researchCell.setAttribute("data-label", researchLabel);
      researchCell.textContent = researchText;

      tableRow.appendChild(researchCell);
      tableRow.appendChild(createPopupTableLinkCell({
        link_label: linkLabel,
        link_url: linkData,
      }, linkLabelText));

      popupElements.tableBody.appendChild(tableRow);
      hasVisibleRow = true;
    });

    popupElements.tableWrap.hidden = !hasVisibleRow;
  }

  function getPreferredPopupFocusTarget(root, popupElements) {
    if (!popupElements || !popupElements.popup) {
      return null;
    }

    if (popupElements.primaryLink && !popupElements.primaryLink.hidden) {
      return popupElements.primaryLink;
    }

    return popupElements.popup.querySelector(".ded-popup-table-link");
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

    clearPopupDynamicContent(popupElements);
    popupElements.popup.classList.remove("is-open");
    popupElements.popup.setAttribute("aria-hidden", "true");
    root.__dedPopupPinned = false;
    root.__dedActivePopupNode = null;
    setNodeExpanded(root, null);
  }

  function openPopup(root, node, persistent) {
    var popupElements = getPopupElements(root);
    if (!popupElements || !popupElements.popup) {
      return;
    }

    var popupContent = parseNodePopupContent(node);
    var title = typeof popupContent.title === "string" ? popupContent.title : "";
    var description =
      typeof popupContent.description === "string" ? popupContent.description : "";
    var image = typeof popupContent.image === "string" ? popupContent.image : "";

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

    applyLinkData(popupElements.primaryLink, popupContent.cardLink);
    renderPopupTableRows(popupElements, popupContent.tableRows);

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

    var popupNodes = getPopupNodes(root);
    if (!popupNodes.length) {
      closePopup(root);
      return;
    }

    var isTouchDevice =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches;

    var nodeCleanups = [];
    popupNodes.forEach(function (popupNode) {
      var onPointerEnter = function (event) {
        if (isTouchDevice || root.__dedPopupPinned) {
          return;
        }
        var node = getNodeFromTarget(root, event.currentTarget);
        if (!node) {
          return;
        }
        openPopup(root, node, false);
      };

      var onPointerLeave = function (event) {
        if (isTouchDevice || root.__dedPopupPinned) {
          return;
        }

        var relatedNode = getNodeFromTarget(root, event.relatedTarget);
        if (relatedNode && relatedNode === popupNode) {
          return;
        }

        closePopup(root);
      };

      var onFocusIn = function (event) {
        var node = getNodeFromTarget(root, event.currentTarget);
        if (!node || root.__dedPopupPinned) {
          return;
        }
        openPopup(root, node, false);
      };

      var onFocusOut = function () {
        if (!root.__dedPopupPinned) {
          closePopup(root);
        }
      };

      var onClick = function (event) {
        var node = getNodeFromTarget(root, event.currentTarget);
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

      var onKeyDown = function (event) {
        var node = getNodeFromTarget(root, event.currentTarget);
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
        var focusTarget = getPreferredPopupFocusTarget(root, activePopup);
        if (focusTarget) {
          focusTarget.focus();
        }
      };

      popupNode.addEventListener("pointerenter", onPointerEnter);
      popupNode.addEventListener("pointerleave", onPointerLeave);
      popupNode.addEventListener("focusin", onFocusIn);
      popupNode.addEventListener("focusout", onFocusOut);
      popupNode.addEventListener("click", onClick);
      popupNode.addEventListener("keydown", onKeyDown);

      nodeCleanups.push(function () {
        popupNode.removeEventListener("pointerenter", onPointerEnter);
        popupNode.removeEventListener("pointerleave", onPointerLeave);
        popupNode.removeEventListener("focusin", onFocusIn);
        popupNode.removeEventListener("focusout", onFocusOut);
        popupNode.removeEventListener("click", onClick);
        popupNode.removeEventListener("keydown", onKeyDown);
      });
    });

    var onPopupLinkClick = function (event) {
      if (!popupElements.primaryLink || popupElements.primaryLink.classList.contains("is-disabled")) {
        event.preventDefault();
      }
    };
    if (popupElements.primaryLink) {
      popupElements.primaryLink.addEventListener("click", onPopupLinkClick);
    }

    var onDocumentClick = function (event) {
      var target = event.target;
      if (!(target instanceof Element)) {
        closePopup(root);
        return;
      }

      var clickedNode = getNodeFromTarget(root, target);
      if (clickedNode) {
        return;
      }

      if (popupElements.card && popupElements.card.contains(target)) {
        return;
      }

      closePopup(root);
    };
    document.addEventListener("click", onDocumentClick);

    var onDocumentKeyDown = function (event) {
      if (event.key === "Escape") {
        closePopup(root);
      }
    };
    document.addEventListener("keydown", onDocumentKeyDown);

    popupCleanupByRoot.set(root, function () {
      nodeCleanups.forEach(function (cleanup) {
        cleanup();
      });
      if (popupElements.primaryLink) {
        popupElements.primaryLink.removeEventListener("click", onPopupLinkClick);
      }
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

  function syncCanvasSize(root) {
    var canvas = getCanvas(root);
    if (!canvas) {
      return 0;
    }

    var canvasRect = canvas.getBoundingClientRect();
    var width = canvasRect.width || 0;
    if (!width) {
      var rootRect = root.getBoundingClientRect();
      var configuredSize = parseCssPx(
        window.getComputedStyle(root).getPropertyValue("--ded-container-size")
      );
      var rootInnerWidth = Math.max(0, (rootRect.width || 0) - 24);
      if (configuredSize > 0) {
        width = rootInnerWidth > 0 ? Math.min(rootInnerWidth, configuredSize) : configuredSize;
      } else {
        width = rootInnerWidth;
      }
    }

    if (!width || !Number.isFinite(width)) {
      return 0;
    }

    var normalizedWidth = Math.max(1, width);
    var pxValue = normalizedWidth.toFixed(3) + "px";
    if (root.__dedCanvasSize !== pxValue) {
      root.style.setProperty("--ded-canvas-size", pxValue);
      root.__dedCanvasSize = pxValue;
    }

    return normalizedWidth;
  }

  function updateLayoutScale(root) {
    syncCanvasSize(root);

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

    root.style.removeProperty("--ded-canvas-size");
    root.style.removeProperty("--ded-layout-scale");
    delete root.__dedCanvasSize;
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

  function bindElementorReadyHook() {
    if (elementorReadyHookBound) {
      return;
    }

    if (
      !window.elementorFrontend ||
      !window.elementorFrontend.hooks ||
      typeof window.elementorFrontend.hooks.addAction !== "function"
    ) {
      return;
    }

    window.elementorFrontend.hooks.addAction(
      "frontend/element_ready/dope_elementor_flower_diagram.default",
      function ($scope) {
        var scopeElement = getScopeElement($scope);
        boot(scopeElement, true);
      }
    );

    elementorReadyHookBound = true;
  }

  bindElementorReadyHook();

  window.addEventListener("elementor/frontend/init", function () {
    bindElementorReadyHook();
  });

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
