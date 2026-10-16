# Changesets

功能或修复需要发布时，运行 `npm run changeset`，选择版本类型并填写中文变更说明，将生成的 `.changeset/*.md` 与代码一起提交。

合入 `main` 后，GitHub Actions 会创建或更新版本 PR。检查版本号和 `CHANGELOG.md`，通过 CI 后合并，工作流会自动发布 npm 包。纯文档、测试或 CI 修改无需新增版本 changeset。

首次发布使用仓库已有的 `0.1.0`。配置、认证和重试方式见 [发布说明](../docs/publishing.md)。
