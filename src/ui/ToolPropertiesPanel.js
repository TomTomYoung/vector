// ToolPropertiesPanel.js
// ツールのプロパティと操作説明を表示・管理するパネル
class ToolPropertiesPanel {
  constructor(toolManager) {
    this.toolManager = toolManager;
    this.panel = null;
    this.currentTool = null;

    // デフォルトの共通プロパティ
    this.commonProperties = {
      fillColor: "#ffffff",
      fillEnabled: false,
      strokeColor: "#000000",
      strokeWidth: 2,
      strokeStyle: "solid", // solid, dashed, dotted
    };

    this.init();
  }

  init() {
    this.createPanel();
    this.setupToolChangeListener();
  }

  createPanel() {
    // 既存のパネルコンテナを取得
    const panelContainer = document.getElementById("tool-properties-panel");
    if (panelContainer) {
      this.panel = panelContainer;
      this.panel.innerHTML = "";
    } else {
      this.panel = document.createElement("div");
      this.panel.id = "tool-properties-panel";
      document.body.appendChild(this.panel);
    }
  }

  setupToolChangeListener() {
    // ツールが切り替わったときにパネルを更新
    document.addEventListener("toolChanged", (e) => {
      this.currentTool = e.detail.tool;
      this.updatePanel();
    });
  }

  updatePanel() {
    if (!this.currentTool) {
      this.panel.innerHTML = "<p style='color: #666;'>ツールが選択されていません</p>";
      return;
    }

    this.panel.innerHTML = "";

    // ツール名
    const title = document.createElement("h3");
    title.textContent = this.currentTool.getTitle();
    title.style.cssText = `
      margin: 0 0 15px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid #333;
      font-size: 18px;
    `;
    this.panel.appendChild(title);

    // 操作説明セクション
    this.createInstructionsSection();

    // 共通プロパティセクション
    this.createCommonPropertiesSection();

    // ツール固有プロパティセクション
    this.createToolSpecificPropertiesSection();
  }

  createInstructionsSection() {
    const section = this.createSection("操作方法");

    const instructionsData = this.currentTool.getInstructions
      ? this.currentTool.getInstructions()
      : [];

    let instructionItems = [];
    let instructionControls = [];

    if (Array.isArray(instructionsData)) {
      instructionItems = instructionsData;
    } else if (instructionsData && typeof instructionsData === "object") {
      instructionItems = instructionsData.items || [];
      instructionControls = instructionsData.controls || [];
    }

    if (instructionItems.length === 0) {
      const noInstructions = document.createElement("p");
      noInstructions.textContent = "操作説明はありません";
      noInstructions.style.cssText = "color: #999; font-size: 12px;";
      section.appendChild(noInstructions);
    } else {
      const list = document.createElement("ul");
      list.style.cssText = `
        margin: 5px 0;
        padding-left: 20px;
        font-size: 13px;
        line-height: 1.6;
      `;
      instructionItems.forEach((instruction) => {
        const item = document.createElement("li");
        item.textContent = instruction;
        item.style.marginBottom = "8px";
        list.appendChild(item);
      });

      section.appendChild(list);
    }

    if (instructionControls.length > 0) {
      this.renderInstructionControls(section, instructionControls);
    }

    this.panel.appendChild(section);
  }

  renderInstructionControls(container, controls) {
    controls.forEach((control) => {
      const group = this.createPropertyGroup(control.label);

      switch (control.type) {
        case "select": {
          const select = this.createSelect(
            control.options,
            control.value,
            (value) => {
              if (control.onChange) {
                control.onChange(value);
              }
            }
          );
          group.appendChild(select);
          break;
        }
        case "checkbox": {
          const checkbox = this.createCheckbox(
            control.checkLabel || "",
            Boolean(control.value),
            (checked) => {
              if (control.onChange) {
                control.onChange(checked);
              }
            }
          );
          group.appendChild(checkbox);
          break;
        }
        case "number": {
          const numberInput = this.createNumberInput(
            control.value,
            control.min,
            control.max,
            control.step,
            (value) => {
              if (control.onChange) {
                control.onChange(value);
              }
            }
          );
          group.appendChild(numberInput);
          break;
        }
        case "color": {
          const colorInput = this.createColorInput(control.value, (color) => {
            if (control.onChange) {
              control.onChange(color);
            }
          });
          group.appendChild(colorInput);
          break;
        }
        default:
          break;
      }

      container.appendChild(group);
    });
  }

  createCommonPropertiesSection() {
    const section = this.createSection("共通プロパティ");

    // 塗りつぶし色
    const fillGroup = this.createPropertyGroup("塗りつぶし");
    const fillCheckbox = this.createCheckbox(
      "有効",
      this.commonProperties.fillEnabled,
      (checked) => {
        this.commonProperties.fillEnabled = checked;
        fillColorInput.disabled = !checked;
        this.notifyPropertyChange();
      }
    );
    fillGroup.appendChild(fillCheckbox);

    const fillColorInput = this.createColorInput(
      this.commonProperties.fillColor,
      (color) => {
        this.commonProperties.fillColor = color;
        this.notifyPropertyChange();
      }
    );
    fillColorInput.disabled = !this.commonProperties.fillEnabled;
    fillGroup.appendChild(fillColorInput);
    section.appendChild(fillGroup);

    // 線色
    const strokeColorGroup = this.createPropertyGroup("線色");
    const strokeColorInput = this.createColorInput(
      this.commonProperties.strokeColor,
      (color) => {
        this.commonProperties.strokeColor = color;
        this.notifyPropertyChange();
      }
    );
    strokeColorGroup.appendChild(strokeColorInput);
    section.appendChild(strokeColorGroup);

    // 線幅
    const strokeWidthGroup = this.createPropertyGroup("線幅");
    const strokeWidthInput = this.createNumberInput(
      this.commonProperties.strokeWidth,
      0.5,
      50,
      0.5,
      (value) => {
        this.commonProperties.strokeWidth = value;
        this.notifyPropertyChange();
      }
    );
    strokeWidthGroup.appendChild(strokeWidthInput);
    section.appendChild(strokeWidthGroup);

    // 線スタイル
    const strokeStyleGroup = this.createPropertyGroup("線スタイル");
    const strokeStyleSelect = this.createSelect(
      [
        { value: "solid", label: "実線" },
        { value: "dashed", label: "破線" },
        { value: "dotted", label: "点線" },
      ],
      this.commonProperties.strokeStyle,
      (value) => {
        this.commonProperties.strokeStyle = value;
        this.notifyPropertyChange();
      }
    );
    strokeStyleGroup.appendChild(strokeStyleSelect);
    section.appendChild(strokeStyleGroup);

    this.panel.appendChild(section);
  }

  createToolSpecificPropertiesSection() {
    if (!this.currentTool.getToolProperties) {
      return;
    }

    const toolProps = this.currentTool.getToolProperties();
    if (!toolProps || toolProps.length === 0) {
      return;
    }

    const section = this.createSection("ツール固有設定");

    toolProps.forEach((prop) => {
      const group = this.createPropertyGroup(prop.label);

      switch (prop.type) {
        case "number":
          const numberInput = this.createNumberInput(
            prop.value,
            prop.min,
            prop.max,
            prop.step,
            (value) => {
              if (prop.onChange) {
                prop.onChange(value);
              }
            }
          );
          group.appendChild(numberInput);
          break;

        case "select":
          const select = this.createSelect(prop.options, prop.value, (value) => {
            if (prop.onChange) {
              prop.onChange(value);
            }
          });
          group.appendChild(select);
          break;

        case "checkbox":
          const checkbox = this.createCheckbox(prop.checkLabel || "", prop.value, (checked) => {
            if (prop.onChange) {
              prop.onChange(checked);
            }
          });
          group.appendChild(checkbox);
          break;

        case "color":
          const colorInput = this.createColorInput(prop.value, (color) => {
            if (prop.onChange) {
              prop.onChange(color);
            }
          });
          group.appendChild(colorInput);
          break;
      }

      section.appendChild(group);
    });

    this.panel.appendChild(section);
  }

  createSection(title) {
    const section = document.createElement("div");
    section.style.cssText = `
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #ddd;
    `;

    const heading = document.createElement("h4");
    heading.textContent = title;
    heading.style.cssText = `
      margin: 0 0 10px 0;
      font-size: 14px;
      color: #333;
      font-weight: bold;
    `;
    section.appendChild(heading);

    return section;
  }

  createPropertyGroup(label) {
    const group = document.createElement("div");
    group.style.cssText = `
      margin-bottom: 12px;
    `;

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      color: #555;
    `;
    group.appendChild(labelEl);

    return group;
  }

  createNumberInput(value, min, max, step, onChange) {
    const input = document.createElement("input");
    input.type = "number";
    input.value = value;
    input.min = min;
    input.max = max;
    input.step = step;
    input.style.cssText = `
      width: 100%;
      padding: 6px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
      box-sizing: border-box;
    `;
    input.addEventListener("change", (e) => {
      onChange(parseFloat(e.target.value));
    });
    return input;
  }

  createColorInput(value, onChange) {
    const container = document.createElement("div");
    container.style.cssText = "display: flex; gap: 8px; align-items: center;";

    const input = document.createElement("input");
    input.type = "color";
    input.value = value;
    input.style.cssText = `
      width: 50px;
      height: 32px;
      border: 1px solid #ccc;
      border-radius: 4px;
      cursor: pointer;
    `;
    input.addEventListener("change", (e) => {
      textInput.value = e.target.value;
      onChange(e.target.value);
    });
    container.appendChild(input);

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = value;
    textInput.style.cssText = `
      flex: 1;
      padding: 6px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
    `;
    textInput.addEventListener("change", (e) => {
      input.value = e.target.value;
      onChange(e.target.value);
    });
    container.appendChild(textInput);

    return container;
  }

  createSelect(options, value, onChange) {
    const select = document.createElement("select");
    select.style.cssText = `
      width: 100%;
      padding: 6px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
      background: white;
      cursor: pointer;
    `;

    options.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === value) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener("change", (e) => {
      onChange(e.target.value);
    });

    return select;
  }

  createCheckbox(label, checked, onChange) {
    const container = document.createElement("label");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 13px;
    `;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", (e) => {
      onChange(e.target.checked);
    });
    container.appendChild(checkbox);

    const labelText = document.createElement("span");
    labelText.textContent = label;
    container.appendChild(labelText);

    return container;
  }

  notifyPropertyChange() {
    // 共通プロパティが変更されたことをツールに通知
    if (this.currentTool && this.currentTool.onCommonPropertiesChanged) {
      this.currentTool.onCommonPropertiesChanged(this.commonProperties);
    }
  }

  getCommonProperties() {
    return { ...this.commonProperties };
  }
}

window.ToolPropertiesPanel = ToolPropertiesPanel;
