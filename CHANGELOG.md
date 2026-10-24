# Changelog

## [0.2.0](https://github.com/sovrin/erratas/compare/v0.1.0...v0.2.0) (2026-10-24)


### ⚠ BREAKING CHANGES

* /api/errors/* moved under /api/p/<id>/errors; the project: search key is gone; the status hook is gone (nexitas shows projectStatus).
* run as a module of nexitas, on its shared projects

### Features

* one project's errors, under its /p/&lt;id&gt; ([17ce86f](https://github.com/sovrin/erratas/commit/17ce86f5ea5d5927fff40a5aa0aab584a914ff51))
* run as a module of nexitas, on its shared projects ([347f60f](https://github.com/sovrin/erratas/commit/347f60f24ade9077487ad02f405de3a3725e5441))
* the console's look: a hue, a sidebar figure and the overview's story ([8968e53](https://github.com/sovrin/erratas/commit/8968e533bcdaf350f3ffabd38d91735095f0c074))


### Bug Fixes

* build on the core's toolkit, in its UI patterns ([2f50a55](https://github.com/sovrin/erratas/commit/2f50a550f2a61285bbd356fc1cfef077bb359d4a))
* draw every page with the core's page kit ([742bba5](https://github.com/sovrin/erratas/commit/742bba556af0f0e43846dec7bbf6ff9d9d8acc65))
* every stack frame shares one edge ([e593d53](https://github.com/sovrin/erratas/commit/e593d53d189609a13acdf2ab31ae21fcb90f5cfb))
* one status filter, and a stack is deleted on purpose ([be9abe3](https://github.com/sovrin/erratas/commit/be9abe3c938b81d69f6b5e9823937c2c99f1ebb3))
* **security:** limit ingest per stack and new issues, page issues in SQL ([2d3d549](https://github.com/sovrin/erratas/commit/2d3d549123a0f5e84a7a1bbe3f135b8e40b27e73))
* the issues and their stacks load at once ([37551d9](https://github.com/sovrin/erratas/commit/37551d9bc6141a17b28ebaa89a2c7bf8aa3ef451))
