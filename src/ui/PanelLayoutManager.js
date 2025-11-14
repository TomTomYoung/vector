class PanelLayoutManager {
  constructor() {
    this.activeResize = null;
    this.groups = [];
    this.init();
  }

  init() {
    this.groups = Array.from(document.querySelectorAll("[data-panel-group]"));
    if (this.groups.length === 0) {
      return;
    }

    // 遅延して初期サイズを適用（レイアウトが確定してから）
    window.requestAnimationFrame(() => {
      this.groups.forEach((group) => this.applyInitialSizes(group));
    });

    this.groups.forEach((group) => {
      this.attachResizerHandlers(group);
    });

    document.addEventListener("mousemove", (event) => this.handlePointerMove(event));
    document.addEventListener("mouseup", () => this.stopResize());
    window.addEventListener("resize", () => this.handleResize());
  }

  getSections(group) {
    return Array.from(group.querySelectorAll(":scope > .panel-section"));
  }

  getResizers(group) {
    return Array.from(group.querySelectorAll(":scope > .panel-resizer"));
  }

  applyInitialSizes(group) {
    const sections = this.getSections(group);
    if (sections.length === 0) {
      return;
    }

    const ratios = sections.map((section) => {
      const ratio = parseFloat(section.dataset.initialRatio);
      return Number.isFinite(ratio) ? Math.max(ratio, 0) : 1;
    });
    const totalRatio = ratios.reduce((sum, value) => sum + value, 0) || 1;
    const availableHeight = this.getAvailableHeight(group);
    const minHeights = sections.map((section) =>
      this.getMinHeight(section)
    );

    if (availableHeight <= 0) {
      sections.forEach((section, index) => {
        section.style.height = `${minHeights[index]}px`;
      });
      return;
    }

    let remainingHeight = availableHeight;

    sections.forEach((section, index) => {
      const isLast = index === sections.length - 1;
      const minHeight = minHeights[index];
      let desiredHeight;

      if (isLast) {
        desiredHeight = Math.max(minHeight, remainingHeight);
      } else {
        const ratio = ratios[index] / totalRatio;
        desiredHeight = Math.max(minHeight, Math.round(availableHeight * ratio));

        const remainingSections = sections.length - index - 1;
        const minRemaining = minHeights
          .slice(index + 1)
          .reduce((sum, value) => sum + value, 0);

        if (desiredHeight > remainingHeight - minRemaining) {
          desiredHeight = Math.max(minHeight, remainingHeight - minRemaining);
        }
      }

      if (!Number.isFinite(desiredHeight) || desiredHeight <= 0) {
        desiredHeight = minHeight;
      }

      section.style.height = `${desiredHeight}px`;
      remainingHeight -= desiredHeight;
    });

    this.normalizeHeights(group);
  }

  getAvailableHeight(group) {
    const groupHeight = group.clientHeight;
    if (!Number.isFinite(groupHeight) || groupHeight <= 0) {
      return groupHeight;
    }

    const resizers = this.getResizers(group);
    const resizerSpace = resizers.reduce((sum, resizer) => {
      const rect = resizer.getBoundingClientRect();
      const styles = window.getComputedStyle(resizer);
      const marginTop = parseFloat(styles.marginTop) || 0;
      const marginBottom = parseFloat(styles.marginBottom) || 0;
      const height = rect.height || resizer.offsetHeight || 0;
      return sum + height + marginTop + marginBottom;
    }, 0);

    return groupHeight - resizerSpace;
  }

  getMinHeight(section) {
    const minAttr = parseFloat(section.dataset.minHeight);
    if (Number.isFinite(minAttr) && minAttr > 0) {
      return minAttr;
    }
    return 120;
  }

  attachResizerHandlers(group) {
    const resizers = this.getResizers(group);
    resizers.forEach((resizer) => {
      resizer.addEventListener("mousedown", (event) => {
        event.preventDefault();
        const previousSection = this.findPreviousSection(resizer);
        const nextSection = this.findNextSection(resizer);
        if (!previousSection || !nextSection) {
          return;
        }

        const prevRect = previousSection.getBoundingClientRect();
        const nextRect = nextSection.getBoundingClientRect();

        this.activeResize = {
          group,
          resizer,
          previousSection,
          nextSection,
          startY: event.clientY,
          prevHeight: prevRect.height,
          nextHeight: nextRect.height,
          totalHeight: prevRect.height + nextRect.height,
          prevMin: this.getMinHeight(previousSection),
          nextMin: this.getMinHeight(nextSection),
        };

        resizer.classList.add("active");
        document.body.classList.add("resizing-panels");
      });
    });
  }

  findPreviousSection(resizer) {
    let node = resizer.previousElementSibling;
    while (node && !node.classList.contains("panel-section")) {
      node = node.previousElementSibling;
    }
    return node;
  }

  findNextSection(resizer) {
    let node = resizer.nextElementSibling;
    while (node && !node.classList.contains("panel-section")) {
      node = node.nextElementSibling;
    }
    return node;
  }

  handlePointerMove(event) {
    if (!this.activeResize) {
      return;
    }

    const {
      previousSection,
      nextSection,
      prevHeight,
      nextHeight,
      totalHeight,
      startY,
      prevMin,
      nextMin,
    } = this.activeResize;

    const deltaY = event.clientY - startY;

    let newPrevHeight = prevHeight + deltaY;
    let newNextHeight = nextHeight - deltaY;

    if (newPrevHeight < prevMin) {
      newPrevHeight = prevMin;
      newNextHeight = totalHeight - newPrevHeight;
    }

    if (newNextHeight < nextMin) {
      newNextHeight = nextMin;
      newPrevHeight = totalHeight - newNextHeight;
    }

    if (newPrevHeight < prevMin || newNextHeight < nextMin) {
      return;
    }

    previousSection.style.height = `${newPrevHeight}px`;
    nextSection.style.height = `${newNextHeight}px`;
  }

  stopResize() {
    if (!this.activeResize) {
      return;
    }

    if (this.activeResize.resizer) {
      this.activeResize.resizer.classList.remove("active");
    }
    document.body.classList.remove("resizing-panels");
    this.activeResize = null;
  }

  handleResize() {
    this.groups.forEach((group) => this.normalizeHeights(group));
  }

  normalizeHeights(group) {
    const sections = this.getSections(group);
    if (sections.length === 0) {
      return;
    }

    const availableHeight = this.getAvailableHeight(group);
    if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
      return;
    }

    const heights = sections.map((section) => {
      const inlineHeight = parseFloat(section.style.height);
      if (Number.isFinite(inlineHeight) && inlineHeight > 0) {
        return inlineHeight;
      }
      const rect = section.getBoundingClientRect();
      return rect.height > 0 ? rect.height : this.getMinHeight(section);
    });

    let totalHeight = heights.reduce((sum, value) => sum + value, 0);
    const minHeights = sections.map((section) => this.getMinHeight(section));

    if (totalHeight < availableHeight) {
      heights[heights.length - 1] += availableHeight - totalHeight;
      totalHeight = availableHeight;
    }

    if (totalHeight > availableHeight) {
      const scale = availableHeight / totalHeight;
      let adjustedHeights = heights.map((value, index) =>
        Math.max(minHeights[index], Math.round(value * scale))
      );

      let adjustedTotal = adjustedHeights.reduce((sum, value) => sum + value, 0);
      if (adjustedTotal > availableHeight) {
        let excess = adjustedTotal - availableHeight;
        for (let i = adjustedHeights.length - 1; i >= 0 && excess > 0; i--) {
          const reducible = adjustedHeights[i] - minHeights[i];
          if (reducible <= 0) {
            continue;
          }
          const reduction = Math.min(reducible, excess);
          adjustedHeights[i] -= reduction;
          excess -= reduction;
        }
      } else if (adjustedTotal < availableHeight) {
        adjustedHeights[adjustedHeights.length - 1] +=
          availableHeight - adjustedTotal;
      }

      adjustedHeights.forEach((value, index) => {
        sections[index].style.height = `${value}px`;
      });
      return;
    }

    sections.forEach((section, index) => {
      section.style.height = `${heights[index]}px`;
    });
  }
}

window.PanelLayoutManager = PanelLayoutManager;

document.addEventListener("DOMContentLoaded", () => {
  if (!window.panelLayoutManager) {
    window.panelLayoutManager = new PanelLayoutManager();
  }
});
