import ButtonCssIcon from './components/button-css-icon.js';
import GoogleIcon from './components/google-icon.js';
import ToggleButton from './components/toggle-button.js'
import TreeItem from './components/tree-item.js';

import {PackageModel, FolderModel} from './components/class.js'

const {createApp, ref, computed, watch, onMounted, toRaw} = Vue;

const rootApp = createApp({
  components: {
    ButtonCssIcon,
    GoogleIcon,
    ToggleButton,
    TreeItem,
  },
  
  setup () {
    let defPackageDic = {};
    let fontEquivDic = {};

    const setting = ref({
      process: "home",
      type: "Effect",
      previewFont: {
        enabled: true,
        fontSize: 1,
        defFontFamily: ""
      },
      labelSort: {
        isAsc: true,
        style: "folderIsBottom"
      },
      delDupSort: {
        isAsc: true,
        style: "initOrder"
      },
      setToHide: true,
      alignGroupsInRow: false
    });

    const delDupSortType = ref([
      {label:'X', value:'toDelete', isAsc:true},
      {label:'並び順', value:'order', isAsc:true},
      {label:'(読込時)', value:'initOrder', isAsc:true},
      {label:'パッケージ名', value:'name', isAsc:true},
    ]);

    /** 現在インストールされているパッケージのセット
     * @type {{loaded: boolean, data: Map.<string, Set.string>}}
     */
    const installedPackage = {
      loaded: false,
      data: new Map([
        [ 'Effect', new Set() ], // anm2, cam2, scn2, obj2, .object(alias)
        [ 'Movement', new Set() ], // tra2
        [ 'Params', new Set() ], // params
      ])
    };

    const systemArr = [];
    const fontFamilySet = ref(new Set());

    /** ツリー形式のパッケージデータ
     * @type {Map.<string, (FolderModel|PackageModel)[]>}
     */
    const treeDataMap = ref(new Map([
      [ 'Color',    [] ],
      [ 'Effect',   [] ],
      [ 'Font',     [] ],
      [ 'Movement', [] ],
      [ 'Params',   [] ],
    ]));

    /** 読み込み時のtreeDataMap
     * @type {Map.<string, (FolderModel|PackageModel)[]>}
     */
    const initTreeDataMap = new Map([
      [ 'Color',    [] ],
      [ 'Effect',   [] ],
      [ 'Font',     [] ],
      [ 'Movement', [] ],
      [ 'Params',   [] ],
    ]);

    const shownTreeData = computed(()=>treeDataMap.value.get(setting.value.type));
    
    /** treeDataMapをflatにしたもの
     * @type {Map.<string, PackageModel[]>}
     */
    const packageDataMap = computed(() => {
      const resultMap = new Map();
      treeDataMap.value.forEach((modelDatas, key) => {
        orderTreeDatas(modelDatas);
        const resultArr = tree2array(modelDatas);
        resultMap.set(key, resultArr);
      });
      console.log('compute package-data-map.');
      console.log('treeDataMap : ', treeDataMap.value);
      console.log('--> packageDataMap : ', resultMap);
      return resultMap;
  
      function tree2array (modelDatas, labels=[]) {
        const resultArr = [];
        modelDatas.forEach(modelData => {
          // package model
          if (!modelData.children) {
            modelData.props.label = [...labels];
            resultArr.push(modelData);
          // folder model
          } else {
            const arr = tree2array(modelData.children, [...labels, modelData.name]);
            resultArr.push(...arr);
          }
        });
        return resultArr;
      }
    });

    /** packageDataMapをソートしたもの、「設定を削除」ページ用
     * @type {Map.<string, PackageModel[]>}
     */
    const delDupData = computed(() => {
      const sortStyle = setting.value.delDupSort.style;
      const isAsc = setting.value.delDupSort.isAsc ? 1 : -1;
      const target = packageDataMap.value.get(setting.value.type);
      if (sortStyle==='order')
        return target.toSorted((a,b) => isAsc * (a.props.order - b.props.order));
      else 
        return target.toSorted((a,b) => isAsc * (a[sortStyle] > b[sortStyle] ? 1 : -1));
    });


    
    // -----------------------------------------------------------------------
    // .aul2 アクセスキー管理
    // -----------------------------------------------------------------------

    /**
     * .aul2 の各行をそのまま保持する配列
     * key: 行に書かれているキーそのまま / originalName: accessKeyMapのキー(接頭辞を除いたもの)
     * @type { {text: string, key: string|null, originalName: string|null}[] }
     */
    const aul2Lines = ref([]);

    /**
     * lineIndex: aul2Lines 内の行インデックス（null = .aul2 に未定義）
     * init: 読み込み時の値 ... 変更していない行をそのまま書き戻すために保持
     * @type {Map.<string, {displayName: string, accessKey: string, lineIndex: number|null, init?: {displayName: string, accessKey: string}}>}
     */
    const accessKeyMap = ref(new Map());

    async function readAul2File(e) {
      const file = e.currentTarget.files[0];
      if (!file) return;
      e.currentTarget.value = null;

      const text = await file.text();
      const lines = text.split(/\r\n|\n/);

      const newAul2Lines = [];
      const newAccessKeyMap = new Map();

      lines.forEach(line => {
        // コメント・空行・セクションヘッダはそのまま
        if (line.startsWith(';') || line.trim() === '' || line.startsWith('[')) {
          newAul2Lines.push({text: line, key: null, originalName: null});
          return;
        }

        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) {
          newAul2Lines.push({text: line, key: null, originalName: null});
          return;
        }

        const key = line.slice(0, eqIdx);
        const originalName = key.replace(/^(?:object|effect)\./, '');
        const valuePart = line.slice(eqIdx + 1);

        // 末尾の (&X) を探す
        const keyMatch = valuePart.match(/\((&[^)]+)\)\s*$/);
        const accessKey = keyMatch ? keyMatch[1].slice(1) : ''; // '&V' → 'V'
        const displayName = keyMatch
          ? valuePart.slice(0, valuePart.lastIndexOf('(' + keyMatch[1] + ')')).trimEnd()
          : valuePart;

        const lineIndex = newAul2Lines.length;
        newAul2Lines.push({text: line, key, originalName});
        newAccessKeyMap.set(originalName, {displayName, accessKey, lineIndex, init: {displayName, accessKey}});
      });

      aul2Lines.value = newAul2Lines;
      accessKeyMap.value = newAccessKeyMap;
    }

    function dropAul2File(e) {
      const file = e.dataTransfer?.files[0];
      if (!file?.name.endsWith('.aul2')) return;
      document.getElementById('aul2Input').files = e.dataTransfer.files;
      document.getElementById('aul2Input').dispatchEvent(new Event('change'));
    }

    function saveAul2File() {
      const toLine = (key, entry) => entry.accessKey
        ? `${key}=${entry.displayName}(&${entry.accessKey})`
        : `${key}=${entry.displayName}`;

      // 未定義 & 設定済みのパッケージ/グループを、挿入位置ごとに振り分け
      /** @type {Map.<number, string[]>} 読み込み時の行インデックス → その直後に挿入する行 */
      const insertAfterMap = new Map();
      const restLines = [];
      accessKeyMap.value.forEach((entry, originalName) => {
        if (entry.lineIndex !== null) return; // 既存行 → スキップ
        if (!entry.accessKey && entry.displayName === originalName) return; // 未設定 → スキップ

        const newLine = toLine(originalName, entry);

        // 同じグループに属する定義済み行の最後を探す
        let insertAfterIdx = -1;
        for (const packageArr of packageDataMap.value.values()) {
          const packageModel = packageArr.find(model => model.menuName === originalName);
          if (!packageModel) continue;

          const labelStr = JSON.stringify(packageModel.props.label);
          const sameGroupNames = new Set(
            packageArr
              .filter(model => JSON.stringify(model.props.label) === labelStr)
              .map(model => model.menuName)
          );
          insertAfterIdx = aul2Lines.value.findLastIndex(lineObj => sameGroupNames.has(lineObj.originalName));
          if (insertAfterIdx !== -1) break;
        }

        if (insertAfterIdx === -1) restLines.push(newLine);
        else if (insertAfterMap.has(insertAfterIdx)) insertAfterMap.get(insertAfterIdx).push(newLine);
        else insertAfterMap.set(insertAfterIdx, [newLine]);
      });

      // 変更のあった既存行を最新の設定で再構築しつつ、追加行を挿入
      // 挿入位置が見つからなかった行は [Dialog] セクションの手前（なければ末尾）
      const dialogIdx = aul2Lines.value.findIndex(lineObj => lineObj.text.trimStart().startsWith('[Dialog]'));
      const outputLines = [];
      aul2Lines.value.forEach((lineObj, idx) => {
        if (idx === dialogIdx) outputLines.push(...restLines);
        const entry = accessKeyMap.value.get(lineObj.originalName);
        const isChanged = entry?.init && (entry.displayName !== entry.init.displayName || entry.accessKey !== entry.init.accessKey);
        outputLines.push(isChanged ? toLine(lineObj.key, entry) : lineObj.text);
        if (insertAfterMap.has(idx)) outputLines.push(...insertAfterMap.get(idx));
      });
      if (dialogIdx === -1) outputLines.push(...restLines);

      const blob = new Blob([outputLines.join('\r\n')], {type:'text/plain'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'accesskey.aul2';
      link.click();
    }

    /** パッケージ・グループのアクセスキーをセット（入力ボックスから呼ばれる） */
    function setAccessKey(originalName, rawVal) {
      const key = rawVal ? rawVal.toUpperCase().slice(-1) : '';
      const existing = accessKeyMap.value.get(originalName);
      if (existing) {
        existing.accessKey = key;
      } else {
        accessKeyMap.value.set(originalName, {
          displayName: originalName,
          accessKey: key,
          lineIndex: null,
        });
      }
      accessKeyMap.value = new Map(accessKeyMap.value); // reactivity
    }

    /** パッケージ・グループの表示名をセット（表示名の編集から呼ばれる） */
    function setDisplayName(originalName, newDisplayName) {
      const trimmed = newDisplayName.trim();
      const existing = accessKeyMap.value.get(originalName);
      if (existing) {
        existing.displayName = trimmed || originalName;
      } else {
        accessKeyMap.value.set(originalName, {
          displayName: trimmed || originalName,
          accessKey: '',
          lineIndex: null,
        });
      }
      accessKeyMap.value = new Map(accessKeyMap.value); // reactivity
    }


    async function readIniFile(e) {
      const file = e.currentTarget.files[0];
      if (!file) return;
      e.currentTarget.value = null;
      console.log('read aviutl2.ini.');
      const string = await file.text();
      createTreeDataFromString(string);
      if (setting.value.process==='home') setting.value.process = 'labeling';
    }
    function createTreeDataFromString (string) {
      // initialize
      initTreeDataMap.forEach(arr=>arr.splice(0));
      treeDataMap.value.forEach(arr=>arr.splice(0));
      systemArr.splice(0);
      fontFamilySet.value.clear();

      // read file
      /** 読み込み時のflatなパッケージデータ
       * @type {Map<string, PackageModel[]}
       */
      const initPackageData = new Map([
        [ 'Color',    [] ],
        [ 'Effect',   [] ],
        [ 'Font',     [] ],
        [ 'Movement', [] ],
        [ 'Params',   [] ],
      ]);

      string
        .split(/^\[/mg)
        .filter(Boolean)
        .forEach(el => {
          if (/^(?:Color|Effect|Font|Movement|Params)\..+\](?:\r\n|\n|$)/.test(el)) {
            const splitArr = el.trim().split('\r\n');
            const {type, name} = splitArr.shift().match(/(?<type>.+?)\.(?<name>.+?)]$/)?.groups ?? {};
            if (!type) return;

            const model = new PackageModel({name:name});
            // const model = {name:name, initOrder:null, toDelete:false, uninstalled:false, props:{}};
            
            if (
               installedPackage.loaded &&
               installedPackage.data.has(type) &&
              !installedPackage.data.get(type).has(name)
            ) {
              model.toDelete = true;
              model.uninstalled = true;
            }
      
            splitArr.forEach(row => {
              let {key, value} = row.match(/(?<key>.+?)=(?<value>.*)/)?.groups ?? {};
              if (!key) return;
              if (key=='label') value=value.split('\\').filter(Boolean);
              else if (key=='hide'||key=='order') value = parseInt(value);
              model.props[key] = value;
            });
            model.initOrder = model.props.order;
            initPackageData.get(type).push(model);
          }
          else {
            systemArr.push('[' + el.trim());
          }
        });
      
      initPackageData.forEach(arr => arr.sort((a,b) => a.props.order - b.props.order));

      
      // update fontfamily set and add font style
      const fontFamilyArr = [];
      initPackageData.get('Font').forEach(model => {
        let fontFamily = model.name;
        const fontDic = {fontFamily: null, fontWeight: null, fontStretch: null};

        // weight
        const weightKey = [...Object.keys(fontEquivDic.fontWeight)].find(key => new RegExp(` ${key}\\b`,'i').test(fontFamily));
        if (weightKey) {
          fontDic.fontWeight = fontEquivDic.fontWeight[weightKey];
          fontFamily = fontFamily.replace(new RegExp(` ${weightKey}\\b`,'i'),'');
        }
        // condensed
        const stretchKey = [...Object.keys(fontEquivDic.fontStretch)].find(key => new RegExp(` ${key}\\b`,'i').test(fontFamily));
        if (stretchKey) {
          fontDic.fontStretch = fontEquivDic.fontStretch[stretchKey];
          fontFamily = fontFamily.replace(new RegExp(` ${stretchKey}\\b`,'i'),'');
        }
        // font-family
        fontDic.fontFamily = fontFamily;
        fontFamilyArr.push(fontFamily);
        model.fontStyle = fontDic;
      });
      fontFamilySet.value = new Set(fontFamilyArr.sort());


      // transform to tree data
      initPackageData.forEach((modelArr, key) => {
        const resultArr = [];
        modelArr.forEach(packageModel => {
          let addTarget = resultArr;
          packageModel.props.label.forEach(label => {
            const existFolder = addTarget.find(model=>model.name===label && model instanceof FolderModel);
            if (existFolder) {
              addTarget = existFolder.children;
            } else {
              const newFolder = new FolderModel({name:label});
              addTarget.push(newFolder);
              addTarget = newFolder.children;
            }
          });
          addTarget.push(packageModel);
        });
        orderTreeDatas(resultArr);
        treeDataMap.value.set(key, resultArr);
        initTreeDataMap.set(key, resultArr.map(model=>model.clone()));
      });
      console.log('init-tree-data-map : ', initTreeDataMap);
    }

    async function readInstalledPackage(e) {
      const files = e.currentTarget.files;
      if (!files) return;

      // initialize
      installedPackage.loaded = true;
      installedPackage.data.values().forEach(set=>set.clear());

      // add default package
      Object.keys(defPackageDic).forEach(key=>
        installedPackage.data.set(key, new Set(defPackageDic[key]))
      );

      // add packages to installedPackage
      await Promise.all(Array.from(files, async file => {
        const {filename, extension} = file.name.match(/(?<filename>.+)\.(?<extension>.+?)$/)?.groups ?? {};

        if (!/^(?:anm2?|cam2?|scn2?|obj2?|tra2?|object|effect|params)$/.test(extension)) return;

        // param
        if (extension==='params') {
          const text = await file.text();
          text.split('\r\n').filter(Boolean).forEach(row => {
            if (row.charAt(0)===';') return;
            const paramname = row.match(/^(.+)=[\d\-., ]*$/)?.[1];
            installedPackage.data.get('Params').add(`${paramname}@${filename}`);
          });
        }
        // alias
        else if (extension==='object' || extension==='effect') {
          installedPackage.data.get('Effect').add(`${extension}.${filename}`);
        }
        // anm2?|cam2?|scn2?|obj2?|tra2?
        else {
          const addTargetSet = installedPackage.data.get(extension.startsWith('tra') ? 'Movement' : 'Effect');
          // デフォルトのスクリプトファイル
          if (filename==='script') {
            let text;
            if (extension.endsWith('2')) text = await file.text();
            else text = new TextDecoder('shift_jis').decode(await file.arrayBuffer());
            text.match(/(?<=^@).+$/mg).forEach(packagename => addTargetSet.add(packagename));
          } 
          // 複数スクリプトファイル
          else if (filename.charAt(0)==='@') {
            let text;
            if (extension.endsWith('2')) text = await file.text();
            else text = new TextDecoder('shift_jis').decode(await file.arrayBuffer());
            text.match(/(?<=^@).+$/mg).forEach(packagename => addTargetSet.add(packagename+filename));
          } 
          // 単一スクリプトファイル
          else {
            addTargetSet.add(filename);
          }
        }
      }));

      // reflect to packageData
      installedPackage.data.forEach((set, key) => {
        packageDataMap.value.get(key).forEach(pacakgeModel => {
          if (set.has(pacakgeModel.name)) return;
          pacakgeModel.uninstalled = true;
          pacakgeModel.toDelete = true;
        });
      });
    }

    function resetPackageData() {
      treeDataMap.value.keys().forEach(key => 
        treeDataMap.value.set(key, initTreeDataMap.get(key).map(model=>model.clone()))
      );
    }

    function clear() {
      initTreeDataMap.forEach(arr => arr.splice(0));
      treeDataMap.value.forEach(arr=>arr.splice(0));
      systemArr.splice(0);
      fontFamilySet.value.clear();
      setting.value.previewFont.defFontFamily = '';
    }

    function saveIniFile() {
      const resultArr = [...systemArr];
      packageDataMap.value.forEach((packageArr,key) => {
        packageArr
          .filter(pacakgeModel=>!pacakgeModel.toDelete)
          .sort((a,b) => a.props.order - b.props.order)
          .forEach(packageModel=> {
            resultArr.push(`[${key}.${packageModel.name}]`);
            Object.entries(packageModel.props).forEach(([key,value]) => {
              if (key==='label') value = value.filter(Boolean).join('\\');
              resultArr.push(`${key}=${value}`);
            });
          });
      });

      // save
      const blob = new Blob([resultArr.join('\r\n')], {type:'text/plain'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'aviutl2.ini';
      link.click();
    }

    function dropInifile (e) {
      if (!e.dataTransfer.files[0].name.endsWith('.ini')) return;
      document.getElementById('iniInput').files = e.dataTransfer.files;
      document.getElementById('iniInput').dispatchEvent(new Event('change'));
    }


    /** @type { {parent: (FolderModel|PackageModel)[], index: number}[] } */
    const insertTarget = ref([]);
    /** @type { {model: Model, parent: (FolderModel|PackageModel)[], index: number}[] } */
    const insertItems = ref([]);
    const dragData = ref({isDragging: false, startModel: null});
    const resultDivClass = computed(() => {
      const targetDownFlag = 
        dragData.value.startModel === null &&
        insertTarget.value.at(-1)?.parent === shownTreeData.value && 
        insertTarget.value.at(-1)?.index === shownTreeData.value.length;
      return {'is-target-down': targetDownFlag, 'is-row': setting.value.alignGroupsInRow};
    });

    function clearInsertChoice () {
      insertTarget.value.splice(0);
      insertItems.value.splice(0);
    }
    watch(()=>[setting.value.process, setting.value.type], clearInsertChoice);

    function clickNextInput(e) {e.currentTarget.nextElementSibling?.click();}

    function bulkSetHide (model, newState, includeDecendant=false) {
      // パッケージの場合
      if (!model.children) model.props.hide = newState ? 1 : 0;
      // フォルダの場合
      else if (includeDecendant) model.children.forEach(child=>bulkSetHide(child, newState));
    }

    function orderTreeDatas (modelDatas, startOrder=0) {
      if (startOrder===0) console.log('order tree datas', modelDatas[0]?.name);
      let order = startOrder-1;
      modelDatas.forEach(modelData => {
        // package model
        if (!modelData.children) {
          order = Math.floor(order) + 1;
          modelData.props.order = order;
        // folder model
        } else {
          order += 0.01;
          modelData.order = order;
          order = orderTreeDatas(modelData.children, order+1);
        }
      });
      return order;
    }

    /** 表示中のツリー内にある全フォルダを一括で開閉する */
    function toggleAllGroups (open, modelDatas=shownTreeData.value) {
      modelDatas
        .filter(model => model.children)
        .forEach(model => {
          model.isOpen = open;
          toggleAllGroups(open, model.children);
        });
    }

    /** 選択フォルダ内の要素をInsertItemsから除く
     * これをしないと要素がフォルダ外に出てしまう
     */
    function deleteChildTreeItem (modelArr) {
      modelArr
        .filter(model => model.children)
        .forEach(model => {
          // modelの子modelがinsertModelsにあったら削除
          model.children.forEach(child => {
            const i = insertItems.value.findIndex(item=>item.model===child);
            if (i>-1) insertItems.value.splice(i,1);
            if (child.children) deleteChildTreeItem(child.children);
          });
        });
    }



    // -----------------------
    //      drag and click
    // -----------------------
    function mouseDownNewFolder () {
      insertItems.value.push({model:new FolderModel(), parent:null, index:null});
    }
    function mouseEnterToDropArea (e) {
      if (!dragData.value.isDragging) return;
      e.currentTarget.classList.add('is-target');
    }
    function mouseLeaveFromDropArea (e) {
      if (!dragData.value.isDragging) return;
      e.currentTarget.classList.remove('is-target');
    }
    function mouseEnterToResultDiv (e) {
      if (!dragData.value.isDragging) return;
      const bodyHeight = e.currentTarget.getBoundingClientRect().height;
      const index = e.offsetY > bodyHeight/2 ? shownTreeData.value.length : 0;
      insertTarget.value.push({parent: shownTreeData.value, index: index});
    }
    function mouseLeaveFromResultDiv (e) {
      if (!dragData.value.isDragging) return;
      insertTarget.value.pop();
    }

    function mouseDownAll (e) {
      // アクセスキー/表示名の入力中はドラッグ扱いにしない
      if (e.target.closest('.access-key-input')) return;
      dragData.value.isDragging = true;
    }
    function mouseUpAll (e) {
      dragData.value.isDragging = false;
      dragData.value.startModel = null;
      if (!e.ctrlKey) clearInsertChoice();
    }
    
    function mouseUpDropArea (e, toAll, toTop) {
      e.currentTarget.classList.remove('is-target');

      // フォルダに含まれている子要素をinsertItemsから削除
      deleteChildTreeItem(insertItems.value.map(item=>item.model));

      // 挿入アイテムのソート ... 選択順で追加されてしまうため
      insertItems.value
        .sort((a, b)=>{
          const aOrder = a.model.children ? a.model.order : a.model.props.order;
          const bOrder = b.model.children ? b.model.order : b.model.props.order;
          return aOrder - bOrder;
        });

      if (toAll) { // 全体の先頭/末尾へ
        // 大元アイテムの削除
        insertItems.value.forEach(item=>{
          if (!item.parent) return;
          const i = item.parent.findIndex(model=>model===item.model);
          item.parent.splice(i, 1);
        });
        // 挿入
        const index = toTop ? 0 : shownTreeData.value.length;
        shownTreeData.value.splice(index, 0, ...insertItems.value.map(item=>item.model));

      } else { // グループの先頭/末尾へ
        insertItems.value
          .forEach(item => {
            // 大元アイテムの削除
            if (item.parent) {
              const i = item.parent.findIndex(model=>model===item.model);
              item.parent.splice(i, 1);
            }
            // 挿入
            const index = toTop ? 0 : item.parent.length;
            item.parent.splice(index, 0, item.model);
          });
      }
      orderTreeDatas(shownTreeData.value);
    }

    function mouseDownResultDiv () {
      insertTarget.value.unshift({parent: shownTreeData.value, index: 0});
    }
    // drop, drag-end相当
    function mouseUpResultDiv () {
      if (dragData.value.startModel) {
        console.log('this is CLICK, not DROP');
        return;
      }
      if (!insertTarget.value.length) {
        console.log('drop target is NOT exist.');
        return;
      }
      console.log('drop for :', toRaw(insertTarget.value.at(-1)));

      // フォルダに含まれている子要素をinsertItemsから削除
      deleteChildTreeItem(insertItems.value.map(item=>item.model));

      const target = insertTarget.value.at(-1);
      const a = insertItems.value.filter(item=> item.parent === target.parent && item.index < target.index);

      // folderをfolder内部にドロップすると消える対策
      const isContainingTarget = insertItems.value
        .filter(item => item.model.children)
        .some(item => item.model.has(target.parent[target.index]));
      if (isContainingTarget) {
        console.log('target is contained in selected folder.');
        return;
      }
      
      // 挿入アイテムのソート ... 選択順で追加されてしまうため
      insertItems.value
        .sort((a, b)=>{
          const aOrder = a.model.children ? a.model.order : a.model.props.order;
          const bOrder = b.model.children ? b.model.order : b.model.props.order;
          return aOrder - bOrder;
        });

      // 大元アイテムの削除
      insertItems.value.forEach(item=>{
        if (!item.parent) return;
        const i = item.parent.findIndex(model=>model===item.model);
        item.parent.splice(i, 1);
      });
      
      // 挿入
      target.parent.splice(target.index-a.length, 0, ...insertItems.value.map(item=>item.model));

      orderTreeDatas(shownTreeData.value);
    }



    onMounted(async () => {
      setting.value = await fetch('./data/setting.json').then(res=>res.json());
      defPackageDic = await fetch('./data/default-packages.json').then(res=>res.json());
      fontEquivDic  = await fetch('./data/font-style.json').then(res=>res.json());
    });



    return {
      delDupSortType,

      setting,
      treeDataMap,
      shownTreeData,
      packageDataMap,

      fontFamilySet,

      delDupData,

      readIniFile,
      readInstalledPackage,
      resetPackageData,
      clear,
      saveIniFile,
      dropInifile,
      
      insertTarget,
      insertItems,
      dragData,
      resultDivClass,
      clickNextInput,
      bulkSetHide,
      toggleAllGroups,

      accessKeyMap,
      readAul2File,
      saveAul2File,
      dropAul2File,
      setAccessKey,
      setDisplayName,

      mouseEnterToDropArea,
      mouseLeaveFromDropArea,
      mouseEnterToResultDiv,
      mouseLeaveFromResultDiv,

      mouseDownAll,
      mouseUpAll,

      mouseUpDropArea,

      mouseDownResultDiv,
      mouseUpResultDiv,
      mouseDownNewFolder,
    }
  }
});
rootApp.mount('#root');