class HorizontalPaneResizer {
  constructor() {
    this.resizers = [];
    this.activeResize = null;
    this.init();
  }

  init() {
    this.resizers = Array.from(document.querySelectorAll(".vertical-resizer"));
    if (this.resizers.length === 0) {
      return;
    }

    this.resizers.forEach((resizer) => {
      const targetId = resizer.dataset.target;
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) {
        return;
      }

      resizer.addEventListener("mousedown", (event) => {
        event.preventDefault();
        const rect = target.getBoundingClientRect();
        const minAttr = parseFloat(target.dataset.minWidth);
        const maxAttr = parseFloat(target.dataset.maxWidth);

        this.activeResize = {
          resizer,
          target,
          direction: resizer.dataset.direction === "left" ? "left" : "right",
          startX: event.clientX,
          startWidth: rect.width,
          minWidth: Number.isFinite(minAttr) && minAttr > 0 ? minAttr : 160,
          maxWidth: Number.isFinite(maxAttr) && maxAttr > 0 ? maxAttr : null,
        };

        resizer.classList.add("active");
        document.body.classList.add("resizing-columns");
      });
    });

    document.addEventListener("mousemove", (event) => this.handlePointerMove(event));
    document.addEventListener("mouseup", () => this.stopResize());
  }

  handlePointerMove(event) {
    if (!this.activeResize) {
      return;
    }

    const { target, direction, startWidth, startX, minWidth, maxWidth } =
      this.activeResize;

    const multiplier = direction === "left" ? -1 : 1;
    let newWidth = startWidth + (event.clientX - startX) * multiplier;

    if (newWidth < minWidth) {
      newWidth = minWidth;
    }

    if (Number.isFinite(maxWidth) && newWidth > maxWidth) {
      newWidth = maxWidth;
    }

    target.style.width = `${newWidth}px`;
  }

  stopResize() {
    if (!this.activeResize) {
      return;
    }

    if (this.activeResize.resizer) {
      this.activeResize.resizer.classList.remove("active");
    }
    document.body.classList.remove("resizing-columns");
    this.activeResize = null;
  }
}

window.HorizontalPaneResizer = HorizontalPaneResizer;

document.addEventListener("DOMContentLoaded", () => {
  if (!window.horizontalPaneResizer) {
    window.horizontalPaneResizer = new HorizontalPaneResizer();
  }
});
