# BeadCraft 数据模块

规范网格、嵌入式物料快照、项目校验和 Pindo v1 数据迁移。模块没有网络、文件写入或 UI 副作用；示例色表全部为合成演示数据，不是厂商色库。

## 运行

需要 Node.js 22.16+ 和 npm。在本目录执行：

```sh
npm ci
npm test
npm run typecheck
```

`npm test` 先将 TypeScript 构建到 `dist/`，再运行 Node 测试。运行时依赖固定为 Ajv 8.20.0、ajv-formats 3.0.1；开发编译器为 TypeScript 5.9.3。锁文件固定传递依赖。

## 网格与快照

```js
import { CanonicalGrid } from './dist/index.js';

const grid = new CanonicalGrid(3, 2, [1, 0, 3, 2, 1, 3], 3);
console.log(grid.at(2, 0));         // 3，坐标从 0 开始
console.log(grid.count().occupied); // 5
```

网格按行存储，只有 `0` 表示无豆；白豆、透明豆都是正索引。创建 typed array 前检查原始整数，拒绝负数、溢出、小数、稀疏数组及未知索引。单边最多 4096，总格数最多 1,048,576，物料最多 4096 种。导出的数组是副本。

`parsePaletteSnapshot(value)` 和 `parseProject(value)` 接受外部数据，验证 Schema 和跨字段约束后返回独立、深冻结的快照。相同 HEX 不代表同一物料；更新全局色库不改变现有项目快照。结构校验不填默认值、不转换类型、不丢弃未知字段。

`parseProjectJson(text)` 与 `serializeProject(value)` 提供 JSON 往返入口。Schema 存在 `schemas/`；数组长度、身份唯一性、占位与进度、资产引用等约束由语义校验补足。JSON 文本入口有字符预算，文件大小和 ZIP 解压预算需由应用层另行限制。

## 迁移旧数据

```js
import { readFileSync } from 'node:fs';
import { migrateLegacyPindo } from './dist/index.js';

const fixture = name => JSON.parse(
  readFileSync(new URL(`./test/fixtures/${name}.json`, import.meta.url), 'utf8')
);
const { document, warnings } = migrateLegacyPindo(
  fixture('legacy-v1'), fixture('import-options')
);
console.log(document.cells); // [1, 0, 3, 2, 1, 3]
console.log(warnings);
```

示例需保存为本目录的 `.mjs` 文件执行。`import-options.json` 展示完整调用参数：新项目 ID、导入时间、目标 palette、显式旧 ID 映射、转换设置和板参数。真实导入应由调用方确认这些信息，不直接沿用演示参数。

- `isEmpty === true` 转为 0；白色和透明背景设置均不推断为空。
- 占位格必须解析到明确物料 ID；未知色和多个旧身份合并到一个目标身份均拒绝。
- 原始 metadata 保留在 notes；旧格式缺失的进度和锁定初始化为 0，并返回提示。
- 不恢复不存在的源图，不访问磁盘。应用须将新文档另存，并保留旧文件。

`parseCellPatchCommand(command, project)` 检查项目、修订号、修改前值、锁定和目标物料，返回冻结的命令。它不执行修改；应用层须实现原子应用、进度同步、撤销和事务保存。

校验失败抛出 `DomainError`，提供 `code` 与字段 `path`；错误消息不序列化输入文档。

## 当前边界

这不是完整图片转换器。图像解码和量化、编辑界面、撤销、存储、ZIP 导入、物理连通与熨烫强度尚未由本模块实现。空网格可以保存为草稿，不表示可制作性通过；分件覆盖检查也不表示物理连接或材料兼容。

项目尚未选定开源许可证，模块暂沿用 `UNLICENSED` 标记。依赖许可分别为 Ajv MIT、ajv-formats MIT、TypeScript Apache-2.0；安装包中附有各自的许可文本。
