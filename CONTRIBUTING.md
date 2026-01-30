# Contributing to SocialiseIT

First off, thanks for taking the time to contribute! 🎉

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/MerlinStacks/socialiseit/issues) to avoid duplicates.

When creating a bug report, include:
- **Clear title** describing the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs what actually happened
- **Screenshots** if applicable
- **Environment details** (OS, browser, Docker version)

### Suggesting Features

Feature requests are welcome! Please:
1. Check if the feature is already on our [Roadmap](README.md#roadmap)
2. Open an issue with the `enhancement` label
3. Describe the use case and expected behavior

### Pull Requests

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feature/amazing-feature`
3. **Make your changes** following our code style
4. **Test thoroughly** — ensure `npm run build` passes
5. **Commit** with clear messages: `git commit -m 'Add amazing feature'`
6. **Push** to your fork: `git push origin feature/amazing-feature`
7. **Open a Pull Request** against `main`

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/socialiseit.git
cd socialiseit

# Install dependencies
cd app
npm install

# Set up environment
cp ../stack.env.example ../.env

# Start development
docker-compose up -d postgres redis
npm run dev
```

## Code Style

- **TypeScript** is required for all new code
- **ESLint** rules must pass (`npm run lint`)
- **Prisma** schema changes require migrations
- **Components** should use the existing design system tokens
- **API routes** should include Zod validation

## Commit Messages

Follow conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## Questions?

Open a [discussion](https://github.com/MerlinStacks/socialiseit/discussions) for general questions.
