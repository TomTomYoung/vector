// ToolPropertiesPanel.js
// ツールのプロパティと操作説明を表示・管理するパネル
class ToolPropertiesPanel {
  constructor(toolManager) {
    this.toolManager = toolManager;
    this.panel = null;
    this.currentTool = null;
    this.transformManagers = new WeakMap(); // オブジェクト -> TransformManager
    this.splineEditor = new SplineEditor(toolManager, () => this.updatePanel());
    this.circleEditor = new CircleEditor(toolManager, () => this.updatePanel());
    this.arcEditor = new ArcEditor(toolManager, () => this.updatePanel());
    this.pointSetEditor = new PointSetEditor(toolManager, () => this.updatePanel());

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
    this.setupSelectionListener();
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

  setupSelectionListener() {
    // 選択が変更されたときにパネルを更新（アフィン変換レイヤー用）
    // window.selectedObjectの変更を定期的にチェック
    let lastSelectedObject = null;
    let lastSelectionCount = 0;
    setInterval(() => {
      const currentSelectionCount = window.selectedObjects ? window.selectedObjects.length : 0;
      if (window.selectedObject !== lastSelectedObject || currentSelectionCount !== lastSelectionCount) {
        lastSelectedObject = window.selectedObject;
        lastSelectionCount = currentSelectionCount;
        this.updatePanel();
      }
    }, 100);
  }

  updatePanel() {
    const selected = window.selectedObjects?.length === 1 ? window.selectedObjects[0] : null;
    this.splineEditor.select(this.toolManager.activeToolName === 'select' && selected?.hasAttribute('data-vector-spline') ? selected : null);
    this.circleEditor.select(this.toolManager.activeToolName === 'select' && (selected?.tagName === 'circle' || selected?.hasAttribute('data-vector-circle')) ? selected : null);
    this.arcEditor.select(this.toolManager.activeToolName === 'select' && selected?.hasAttribute('data-vector-arc') ? selected : null);
    this.pointSetEditor.select(this.toolManager.activeToolName === 'select' && selected?.hasAttribute('data-vector-pointset') ? selected : null);
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

    this.createImplementationSection();
    if (this.pointSetEditor.element) {
      const section = this.createSection('元の点群から再計算', {emphasize: true});
      section.dataset.pointsetEditor = '';this.pointSetEditor.render(section);this.panel.append(section);
    }
    if (this.arcEditor.element) {
      const section = this.createSection('円弧の元データを編集', {emphasize: true});
      section.dataset.arcEditor = '';this.arcEditor.render(section);this.panel.append(section);
    }
    if (this.circleEditor.element) {
      const section = this.createSection('円の元データを編集', {emphasize: true});
      section.dataset.circleEditor = '';this.circleEditor.render(section);this.panel.append(section);
    }
    if (this.splineEditor.element) {
      const section = this.createSection('曲線の元データを編集', {emphasize: true});
      section.dataset.splineEditor = '';
      this.splineEditor.render(section);
      this.panel.append(section);
    }

    // 共通プロパティセクション
    this.createCommonPropertiesSection();

    // ツール固有プロパティセクション
    this.createToolSpecificPropertiesSection();

    // 選択されたオブジェクトのアフィン変換レイヤーセクション
    this.createTransformLayersSection();
  }

  createImplementationSection() {
    const host = this.toolManager.host, name = this.currentTool.implementationName ?? this.toolManager.activeToolName;
    const section = this.createSection('実装・アルゴリズム', {emphasize: true});
    section.dataset.implementationPanel = name;
    section.style.overflowWrap = 'anywhere';
    const note = document.createElement('p');
    note.textContent = '次の作図・編集に使用する方式です。';
    section.append(note);
    const info = host.describe?.(name);
    const show = (title, item) => {
      const p = document.createElement('p');
      p.textContent = title + ': ' + (item?.algorithm ?? '情報未指定');
      p.style.cssText = 'font-size:12px;line-height:1.6'; section.append(p);
      if (item?.source) {
        const source = document.createElement('a');
        const path = String(item.source);
        source.textContent = '実装: ' + path;
        if (/^src\/[\w/.-]+\.js$/.test(path)) source.href = 'https://github.com/TomTomYoung/vector/blob/master/' + path;
        else if (/^https?:\/\//.test(path)) source.href = path;
        source.target = '_blank'; source.rel = 'noopener'; source.style.fontSize = '11px'; section.append(source);
      }
    };
    const variants = host.implementations?.(name) ?? [];
    if (variants.length > 1) {
      const group = this.createPropertyGroup('計算の実装');
      const select = this.createSelect(variants.map(v => ({value: v.id, label: v.label})), info.id, id => {
        host.selectImplementation(name, id); this.saveImplementationPreferences(); this.currentTool.onImplementationChanged?.(); this.updatePanel();
      });
      select.dataset.implementationSelect = 'calculation'; select.setAttribute('aria-label', '計算の実装');
      group.append(select); section.append(group);
    }
    show('計算', info);
    if (info?.operations?.length) {
      const p = document.createElement('p');
      p.textContent = '補助演算の差し替え: ' + info.operations.join(', '); p.style.fontSize = '12px'; section.append(p);
    }
    const rendering = host.describeRendering?.(name), renderers = host.renderers?.(name) ?? [];
    if (renderers.length > 1) {
      const group = this.createPropertyGroup('描画の実装');
      const select = this.createSelect(renderers.map(v => ({value: v.id, label: v.label})), rendering.id, id => {
        host.selectRenderer(name, id); this.saveImplementationPreferences(); this.currentTool.onImplementationChanged?.(); this.updatePanel();
      });
      select.dataset.implementationSelect = 'rendering'; select.setAttribute('aria-label', '描画の実装');
      group.append(select); section.append(group);
      const numeric = (label, key, value, min, max, step) => {
        const group = this.createPropertyGroup(label);
        const input = this.createNumberInput(value, min, max, step, value => {
          if (!Number.isFinite(value) || value < min || value > max || (step === 1 && !Number.isInteger(value))) return;
          host.selectRenderer(name, rendering.id, {[key]: value}); this.saveImplementationPreferences(); this.currentTool.onImplementationChanged?.();
        });
        input.dataset.renderParameter = key; input.setAttribute('aria-label', label); group.append(input); section.append(group);
      };
      if (['sampled', 'bernstein'].includes(rendering.id)) numeric('描画の分割数', 'sampleCount', rendering.options.sampleCount ?? 80, 2, 10000, 1);
      if (rendering.id === 'adaptive') {
        numeric('図面座標での許容差', 'tolerance', rendering.options.tolerance ?? 0.25, 0.000001, 1000, 0.05);
        numeric('最大分割深さ', 'maxDepth', rendering.options.maxDepth ?? 12, 0, 18, 1);
      }
    }
    show('描画', rendering);
    this.createPreferenceControls(section);
    if (this.currentTool.implementationError) {
      const p = document.createElement('p'); p.textContent = this.currentTool.implementationError; p.style.color = '#a22'; section.append(p);
    }
    const link = document.createElement('a');
    link.textContent = '方式・換装方法・参照資料';
    link.href = 'https://github.com/TomTomYoung/vector/blob/master/doc/implementation-options.md';
    link.target = '_blank'; link.rel = 'noopener'; section.append(link);
    const selected = window.selectedObjects?.length ? window.selectedObjects : window.selectedObject ? [window.selectedObject] : [];
    if (selected.length) {
      const heading = document.createElement('h5'); heading.textContent = '選択図形に記録された生成・編集方式'; section.append(heading);
      for (const element of selected.slice(0, 10)) {
        const text = document.createElement('p'); text.dataset.recordedImplementation = '';
        try {
          const raw = element.closest('[data-vector-implementation]')?.getAttribute('data-vector-implementation');
          const record = raw?.length < 2000000 ? JSON.parse(raw) : null;
          text.textContent = record?.version === 1 ? `${record.tool}: 計算 ${record.calculation?.algorithm ?? '不明'} / 描画 ${record.rendering?.algorithm ?? '不明'}` +
            (record.dependencies?.length > 1 ? ' / 委譲先 ' + record.dependencies.slice(1).map(d => `${d.tool}: ${d.algorithm}`).join('; ') : '') +
            (record.rendering?.options && Object.keys(record.rendering.options).length ? ' / 描画設定 ' + JSON.stringify(record.rendering.options) : '') +
            (record.parameters ? ' / 図形設定 ' + JSON.stringify(record.parameters) : '') +
            (record.circleEdit?.origin ? ` / 元の生成 ${record.circleEdit.origin.tool}: ${record.circleEdit.origin.calculation?.algorithm ?? '不明'} / 元の描画 ${record.circleEdit.origin.rendering?.algorithm ?? '不明'}` : '') +
            (record.arcEdit?.origin ? ` / 元の生成 ${record.arcEdit.origin.tool}: ${record.arcEdit.origin.calculation?.algorithm ?? '不明'} / 元の描画 ${record.arcEdit.origin.rendering?.algorithm ?? '不明'}` : '') +
            (record.pointSetEdit?.origin ? ` / 元の生成 ${record.pointSetEdit.origin.tool}: ${record.pointSetEdit.origin.calculation?.algorithm ?? '不明'} / 元の描画 ${record.pointSetEdit.origin.rendering?.algorithm ?? '不明'}` : '') +
            (record.sampling ? ` / 描画枝 ${record.sampling.branches}、省略区間 ${record.sampling.omitted.length}` : '') +
            (record.warning ? ' / ' + record.warning : '') + (record.note ? ' / ' + record.note : '') : '方式の記録なし（旧データ・外部SVG等）';
        } catch { text.textContent = '方式の記録を読めません。'; }
        text.style.cssText = 'font-size:12px;line-height:1.6'; section.append(text);
      }
      if (selected.length > 10) section.append(document.createTextNode('先頭10図形の記録を表示しています。'));
    }
    this.panel.append(section);
  }

  saveImplementationPreferences() {
    this.toolManager.preferences?.save();
    const status=this.panel.querySelector('[data-preference-status]');
    if(status) {const state=this.toolManager.preferences.state;status.textContent=state.message;status.style.color=state.warning?'#a22':'';}
  }

  createPreferenceControls(section) {
    const preferences=this.toolManager.preferences;
    if(!preferences)return;
    const heading=document.createElement('h5');heading.textContent='方式設定の保存・復元（全ツール）';section.append(heading);
    const status=document.createElement('p');status.dataset.preferenceStatus='';status.textContent=preferences.state.message;
    status.setAttribute('role','status');status.style.cssText='font-size:12px;line-height:1.6';if(preferences.state.warning)status.style.color='#a22';section.append(status);
    const refresh=()=>{this.currentTool.onImplementationChanged?.();this.updatePanel();};
    const button=(label,id,action)=>{
      const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.preferenceAction=id;
      b.style.cssText='margin:3px';b.addEventListener('click',action);section.append(b);
    };
    button('現在の方式設定を保存','save',()=>{preferences.save();this.updatePanel();});
    button('保存した方式設定を復元','load',()=>{preferences.load();refresh();});
    button('方式設定を初期値へ戻す','reset',()=>{preferences.reset();refresh();});
    button('方式設定JSONを書き出す','export',()=>{
      try {
        const url=URL.createObjectURL(new Blob([preferences.exportText()],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='vector-implementation-settings.json';a.click();
        setTimeout(()=>URL.revokeObjectURL(url),0);
      } catch(error) {preferences.state.message='方式設定を書き出せません。'+error.message;preferences.state.warning=true;this.updatePanel();}
    });
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;input.dataset.preferenceFile='';
    input.addEventListener('change',async()=>{
      const file=input.files[0];if(!file)return;
      try {
        if(file.size>1024000)throw Error('方式設定ファイルが大きすぎます。');
        preferences.importText(await file.text());
      } catch(error) {preferences.state.message='方式設定を読み込めません。'+error.message;preferences.state.warning=true;}
      input.value='';refresh();
    });
    section.append(input);button('方式設定JSONを読み込む','import',()=>input.click());
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
          numberInput.setAttribute('aria-label', control.label);
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
    const section = this.createSection("オブジェクト生成時共通プロパティ", {
      emphasize: true,
    });

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

    const section = this.createSection("ツール固有プロパティ", {
      emphasize: true,
    });

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
          numberInput.setAttribute('aria-label', prop.label);
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
          checkbox.querySelector('input').setAttribute('aria-label', prop.label);
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

        case "custom":
          if (typeof prop.render === "function") {
            prop.render(group);
          }
          break;
      }

      section.appendChild(group);
    });

    this.panel.appendChild(section);
  }

  createSection(title, options = {}) {
    const { emphasize = false } = options;
    const section = document.createElement("div");
    const baseBackground = emphasize
      ? "linear-gradient(180deg, #fdfbff 0%, #f2f5ff 100%)"
      : "#fafafa";
    const borderColor = emphasize ? "#92a5ff" : "#dfe3ec";

    section.style.cssText = `
      margin-bottom: 20px;
      padding: 16px;
      border: 2px solid ${borderColor};
      border-radius: 12px;
      background: ${baseBackground};
      box-shadow: 0 4px 10px rgba(17, 38, 146, 0.08);
    `;

    const heading = document.createElement("h4");
    heading.textContent = title;
    heading.style.cssText = `
      margin: 0 0 10px 0;
      font-size: 15px;
      color: #1d2d50;
      font-weight: bold;
      padding-bottom: 6px;
      border-bottom: 1px dashed ${emphasize ? "#b5c1ff" : "#d0d7e3"};
    `;
    section.appendChild(heading);

    return section;
  }

  createPropertyGroup(label) {
    const group = document.createElement("div");
    const isObjectPropertiesGroup = label === "オブジェクトプロパティ";
    group.style.cssText = `
      margin-bottom: 12px;
      padding: 12px;
      border: 1px solid ${
        isObjectPropertiesGroup ? "#b28bff" : "#d5dae6"
      };
      border-radius: 10px;
      background: ${
        isObjectPropertiesGroup
          ? "linear-gradient(180deg, #fef9ff 0%, #f5f1ff 100%)"
          : "#ffffff"
      };
      box-shadow: ${
        isObjectPropertiesGroup
          ? "0 2px 8px rgba(83, 54, 161, 0.18)"
          : "0 1px 3px rgba(15, 23, 42, 0.08)"
      };
    `;

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.cssText = `
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      color: ${isObjectPropertiesGroup ? "#402b75" : "#555"};
      font-weight: ${isObjectPropertiesGroup ? "bold" : "normal"};
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

  /**
   * アフィン変換レイヤーセクションを作成
   */
  createTransformLayersSection() {
    // 選択されたオブジェクトがない場合はスキップ
    if (!window.selectedObject) {
      return;
    }

    // 複数選択の場合はスキップ（単一選択のみサポート）
    if (window.selectedObjects && window.selectedObjects.length !== 1) {
      return;
    }

    // 要素が有効かチェック
    const element = window.selectedObject;
    if (!element || !element.ownerSVGElement) {
      return;
    }

    // VectorUtilsが読み込まれているか確認
    if (!window.VectorUtils || !window.VectorUtils.TransformManager) {
      return;
    }

    // TransformManagerを取得または作成
    let manager = this.transformManagers.get(element);
    if (!manager) {
      // data属性から復元を試みる
      const serializedData = element.getAttribute('data-transform-layers');
      if (serializedData) {
        try {
          const data = JSON.parse(serializedData);
          manager = window.VectorUtils.TransformManager.deserialize(data);
        } catch (e) {
          console.warn('Failed to deserialize transform layers:', e);
        }
      }

      // まだマネージャーがない場合は新規作成
      if (!manager) {
        const currentMatrix = element.getCTM() || new DOMMatrix();
        manager = new window.VectorUtils.TransformManager(currentMatrix);
      }

      this.transformManagers.set(element, manager);

      // 変更リスナーを追加
      manager.addChangeListener(() => {
        const finalMatrix = manager.compose();
        element.setAttribute('transform', finalMatrix.toString());
        // data属性に保存
        const serialized = JSON.stringify(manager.serialize());
        element.setAttribute('data-transform-layers', serialized);
        window.saveState();
      });
    }

    // セクションを作成
    const section = this.createSection("追加のアフィン変換レイヤー");
    section.style.cssText = `
      background: #1a1a1a;
      color: #fff;
      border-radius: 4px;
      padding: 15px;
      margin-top: 15px;
    `;

    // レイヤー追加ボタン群
    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
      display: flex;
      gap: 5px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    `;

    const buttonStyle = `
      flex: 1;
      min-width: 60px;
      padding: 8px 10px;
      background: #444;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: background 0.2s;
    `;

    // 回転レイヤー追加
    const rotateBtn = document.createElement('button');
    rotateBtn.textContent = '+ 回転';
    rotateBtn.style.cssText = buttonStyle;
    rotateBtn.onmouseover = () => rotateBtn.style.background = '#555';
    rotateBtn.onmouseout = () => rotateBtn.style.background = '#444';
    rotateBtn.onclick = () => this.addTransformLayer(manager, element, 'rotate');
    buttonGroup.appendChild(rotateBtn);

    // スケールレイヤー追加
    const scaleBtn = document.createElement('button');
    scaleBtn.textContent = '+ スケール';
    scaleBtn.style.cssText = buttonStyle;
    scaleBtn.onmouseover = () => scaleBtn.style.background = '#555';
    scaleBtn.onmouseout = () => scaleBtn.style.background = '#444';
    scaleBtn.onclick = () => this.addTransformLayer(manager, element, 'scale');
    buttonGroup.appendChild(scaleBtn);

    // 移動レイヤー追加
    const translateBtn = document.createElement('button');
    translateBtn.textContent = '+ 移動';
    translateBtn.style.cssText = buttonStyle;
    translateBtn.onmouseover = () => translateBtn.style.background = '#555';
    translateBtn.onmouseout = () => translateBtn.style.background = '#444';
    translateBtn.onclick = () => this.addTransformLayer(manager, element, 'translate');
    buttonGroup.appendChild(translateBtn);

    section.appendChild(buttonGroup);

    // レイヤーリスト表示用コンテナ
    const layersContainer = document.createElement('div');
    layersContainer.id = 'transform-layers-list';
    this.renderTransformLayers(manager, element, layersContainer);
    section.appendChild(layersContainer);

    this.panel.appendChild(section);
  }

  /**
   * アフィン変換レイヤーを追加
   */
  addTransformLayer(manager, element, type) {
    // 選択オブジェクトの中心を原点として取得
    let origin = { x: 0, y: 0 };
    try {
      const bbox = element.getBBox();
      const ctm = element.getCTM();
      const centerLocal = {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2
      };

      if (ctm) {
        const pt = element.ownerSVGElement.createSVGPoint();
        pt.x = centerLocal.x;
        pt.y = centerLocal.y;
        const transformed = pt.matrixTransform(ctm);
        origin = { x: transformed.x, y: transformed.y };
      } else {
        origin = centerLocal;
      }
    } catch (e) {
      console.warn('Failed to get element center:', e);
    }

    const layer = new window.VectorUtils.TransformLayer(type, { origin });
    manager.addLayer(layer);
    this.updatePanel();
  }

  /**
   * アフィン変換レイヤーのリストを描画
   */
  renderTransformLayers(manager, element, container) {
    container.innerHTML = '';
    const layers = manager.getLayers();

    if (layers.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.textContent = 'レイヤーがありません';
      emptyMessage.style.cssText = 'color: #999; font-size: 12px; text-align: center; padding: 20px;';
      container.appendChild(emptyMessage);
      return;
    }

    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    layers.forEach((layer, index) => {
      const layerElement = this.createTransformLayerElement(manager, element, layer, index, layers.length);
      listContainer.appendChild(layerElement);
    });

    container.appendChild(listContainer);
  }

  /**
   * 個別のアフィン変換レイヤー要素を作成
   */
  createTransformLayerElement(manager, element, layer, index, totalLayers) {
    const layerDiv = document.createElement('div');
    layerDiv.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 8px;
    `;

    // ヘッダー
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';

    // 有効/無効チェックボックス
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = layer.enabled;
    checkbox.style.cssText = 'cursor: pointer;';
    checkbox.onclick = () => {
      manager.toggleLayer(layer.id);
    };
    header.appendChild(checkbox);

    // レイヤー名
    const nameLabel = document.createElement('span');
    nameLabel.textContent = `${index + 1}. ${layer.name}`;
    nameLabel.style.cssText = 'flex: 1; font-size: 12px; color: ' + (layer.enabled ? '#fff' : '#888');
    nameLabel.ondblclick = () => {
      const newName = prompt('レイヤー名を入力:', layer.name);
      if (newName !== null && newName.trim() !== '') {
        layer.name = newName.trim();
        manager.notifyChange();
      }
    };
    nameLabel.title = 'ダブルクリックで名前を編集';
    header.appendChild(nameLabel);

    // 上へボタン
    const upBtn = this.createIconButton('▲', () => {
      manager.moveLayerUp(layer.id);
    }, index === 0);
    header.appendChild(upBtn);

    // 下へボタン
    const downBtn = this.createIconButton('▼', () => {
      manager.moveLayerDown(layer.id);
    }, index === totalLayers - 1);
    header.appendChild(downBtn);

    // 削除ボタン
    const deleteBtn = this.createIconButton('×', () => {
      if (confirm(`レイヤー「${layer.name}」を削除しますか？`)) {
        manager.removeLayer(layer.id);
      }
    }, false);
    deleteBtn.style.color = '#f88';
    header.appendChild(deleteBtn);

    layerDiv.appendChild(header);

    // パラメータ編集エリア
    const params = this.createLayerParameters(manager, element, layer);
    layerDiv.appendChild(params);

    return layerDiv;
  }

  /**
   * レイヤーパラメータ編集UIを作成
   */
  createLayerParameters(manager, element, layer) {
    const params = document.createElement('div');
    params.style.cssText = `
      background: #252525;
      border-radius: 4px;
      padding: 10px;
      font-size: 11px;
    `;

    // 原点（回転とスケールのみ）
    if (layer.type === 'rotate' || layer.type === 'scale') {
      // 原点リセットボタン
      const resetBtn = document.createElement('button');
      resetBtn.textContent = '原点を中心にリセット';
      resetBtn.style.cssText = `
        width: 100%;
        padding: 6px;
        margin-bottom: 8px;
        background: #3a7bc8;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
      `;
      resetBtn.onclick = () => {
        try {
          const bbox = element.getBBox();
          const ctm = element.getCTM();
          const centerLocal = {
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2
          };

          if (ctm) {
            const pt = element.ownerSVGElement.createSVGPoint();
            pt.x = centerLocal.x;
            pt.y = centerLocal.y;
            const transformed = pt.matrixTransform(ctm);
            layer.origin.x = transformed.x;
            layer.origin.y = transformed.y;
          } else {
            layer.origin.x = centerLocal.x;
            layer.origin.y = centerLocal.y;
          }
          manager.notifyChange();
        } catch (e) {
          console.warn('Failed to reset origin:', e);
        }
      };
      params.appendChild(resetBtn);

      // 原点 X
      params.appendChild(this.createParameterRow('原点 X', Math.round(layer.origin.x * 10) / 10, (value) => {
        layer.origin.x = parseFloat(value) || 0;
        manager.notifyChange();
      }));

      // 原点 Y
      params.appendChild(this.createParameterRow('原点 Y', Math.round(layer.origin.y * 10) / 10, (value) => {
        layer.origin.y = parseFloat(value) || 0;
        manager.notifyChange();
      }));
    }

    // タイプ別パラメータ
    switch (layer.type) {
      case 'rotate':
        params.appendChild(this.createParameterRow('角度 (°)', layer.angle, (value) => {
          layer.angle = parseFloat(value) || 0;
          manager.notifyChange();
        }));
        break;

      case 'scale':
        params.appendChild(this.createParameterRow('スケール X', layer.scaleX, (value) => {
          layer.scaleX = parseFloat(value) || 1;
          manager.notifyChange();
        }, 0.01));

        params.appendChild(this.createParameterRow('スケール Y', layer.scaleY, (value) => {
          layer.scaleY = parseFloat(value) || 1;
          manager.notifyChange();
        }, 0.01));
        break;

      case 'translate':
        params.appendChild(this.createParameterRow('移動 X', layer.translateX, (value) => {
          layer.translateX = parseFloat(value) || 0;
          manager.notifyChange();
        }));

        params.appendChild(this.createParameterRow('移動 Y', layer.translateY, (value) => {
          layer.translateY = parseFloat(value) || 0;
          manager.notifyChange();
        }));
        break;
    }

    return params;
  }

  /**
   * パラメータ行を作成
   */
  createParameterRow(label, value, onChange, step = 0.1) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: #ccc; font-size: 11px;';
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.step = step;
    input.style.cssText = `
      width: 80px;
      padding: 4px 6px;
      background: #1a1a1a;
      color: #fff;
      border: 1px solid #444;
      border-radius: 3px;
      font-size: 11px;
    `;
    input.oninput = (e) => onChange(e.target.value);
    row.appendChild(input);

    return row;
  }

  /**
   * アイコンボタンを作成
   */
  createIconButton(text, onClick, disabled = false) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 0;
      background: #444;
      color: #fff;
      border: none;
      border-radius: 3px;
      cursor: ${disabled ? 'not-allowed' : 'pointer'};
      font-size: 10px;
      opacity: ${disabled ? '0.3' : '1'};
      transition: background 0.2s;
    `;
    if (!disabled) {
      btn.onclick = onClick;
      btn.onmouseover = () => btn.style.background = '#555';
      btn.onmouseout = () => btn.style.background = '#444';
    }
    return btn;
  }
}

window.ToolPropertiesPanel = ToolPropertiesPanel;
