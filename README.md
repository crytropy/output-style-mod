# output-style-mod
Output style 顯示與切換

輸入框下方一直顯示目前的 output style（例如 `style ELI5`）。
`/style` 列出所有可用的 style，`/style <名稱>` 切換。切換後下方的字馬上變，下一回合就用新風格回答。

可用的 style 包含內建的 `default`、`Explanatory`、`Learning`，以及 `~/.claude/output-styles/` 和專案 `.claude/output-styles/` 裡的自訂 style。

## 安裝

在終端機的 Claude Code 裡：

```
/plugin marketplace add crytropy/output-style-mod
/plugin install style@output-style-mod
```

在桌面版 app：按輸入框旁的 +，選 Plugins，Add marketplace 填 `crytropy/output-style-mod`，再 Add plugin 選 `style`。

要讓某個 repo 的 session（含雲端 session）自動載入，在那個 repo 的 `.claude/settings.json` 加上：

```json
{
  "extraKnownMarketplaces": {
    "output-style-mod": { "source": { "source": "github", "repo": "crytropy/output-style-mod" } }
  },
  "enabledPlugins": { "style@output-style-mod": true }
}
```

## 使用

```
/style              列出 style，* 標出目前的
/style Learning     切換成 Learning
/style default      回到預設
```

## 限制

- 輸入框下方那列放不了可點的下拉選單，所以切換用指令。
- 狀態列前面的 `style` 是引擎印的 plugin 名字，拿不掉；文字位置由 app 決定，不能靠右對齊。
- 切換時先用內建的 `/output-style`；這版沒有的話，改寫專案的 `.claude/settings.local.json`。

## 開發

```
claude plugin validate .
claude plugin test .
```
