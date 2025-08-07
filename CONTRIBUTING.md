# Contributing to the Enterprise Developer Series Code Repository

Thank you for your interest in contributing to the official codebase supporting the **Masterminds Enterprise Developer Series** by Victor M. Font Jr.

This repository contains code samples for all 12 volumes of the series. Contributions are welcome—especially bug fixes, performance improvements, and real-world enhancements.

## 🔧 Ways to Contribute

We welcome the following types of contributions:

- 🐛 **Bug Fixes:** Found a typo, broken snippet, or logic error? Send a fix!
- 📈 **Performance Improvements:** Suggest faster or more efficient ways to implement the same logic.
- 🧪 **Test Cases:** Add example test cases or demo files that demonstrate usage.
- 📝 **Documentation Improvements:** Enhance inline comments or `README.md` files within book/chapter folders.
- ✨ **Real-World Variants:** Submit alternate implementations or edge case solutions as long as they’re tied to an existing book chapter.

## 📂 Repository Structure

Each book follows this convention:

Book01_Headless_WordPress/
├── Chapter01/
│   ├── example-file.php
│   └── README.md
├── Chapter02/
…

All contributions must follow this structure. Please do not introduce root-level code unless it applies globally across books.

## 🧭 Guidelines

- **Coding Style:** Match the style of the original file (PHP, JavaScript, SQL). Use 4-space indentation for PHP.
- **Comments:** Include helpful, relevant inline comments. Avoid unnecessary or redundant lines.
- **Compatibility:** Ensure WordPress 6.x compatibility and assume Formidable Forms Elite features.
- **Security:** Sanitize inputs, escape outputs, and follow secure coding principles wherever applicable.
- **Keep It Educational:** The primary goal is to **teach**, not just solve. Favor clarity over cleverness.

## 🛠️ Development Setup

Most code samples are intended to be copied into a developer’s WordPress theme or plugin environment. If you contribute a more complex setup (like a full plugin or REST route), include a `README.md` inside the folder explaining usage and dependencies.

## 📤 Submitting a Pull Request

1. Fork the repository.
2. Create a new branch with a descriptive name: **git checkout -b book04-ch05-fix-loop**
3. Commit changes with meaningful messages.
4. Push your branch: **git push origin book04-ch05-fix-loop**
5. Open a pull request against `main` with a clear summary of what and why.

## 🚫 Please Avoid

- Submitting files without context or without clear linkage to a specific book/chapter.
- Using this repo for promotional or unrelated projects.
- Adding package managers or build tools unless discussed in an issue first.

## 📬 Need Help?

Open an [Issue](https://github.com/YOUR_USERNAME/enterprise-developer-series-code/issues) if you’re unsure where to contribute or want to propose something first.

Thank you for helping us make this series a valuable, open resource for developers worldwide.

---

Victor M. Font Jr.  
Author & Series Architect  
[Formidable Masterminds](https://formidable-masterminds.com)
