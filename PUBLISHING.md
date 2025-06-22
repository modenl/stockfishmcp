# Publishing to NPM Registry

This guide explains how to publish the Chess Trainer MCP Server to the npm registry so users can install it with `npx chess-trainer-mcp`.

## Prerequisites

1. **NPM Account**: Create an account at [npmjs.com](https://www.npmjs.com)
2. **NPM CLI**: Ensure you have npm installed and are logged in
3. **Package Name**: Ensure the package name is available on npm

## Pre-Publishing Checklist

### 1. Test the Package Locally

```bash
# Test the CLI locally
npm link
chess-trainer-mcp --help
chess-trainer-mcp setup
```

### 2. Verify Package Contents

```bash
# See what files will be published
npm pack --dry-run

# This should include:
# - server/ directory
# - client/dist/ directory (built frontend)
# - client/public/ directory (WASM files)
# - bin/ directory (CLI script)
# - README.md, LICENSE, DEPLOYMENT.md
```

### 3. Update Version

```bash
# For patch updates (bug fixes)
npm version patch

# For minor updates (new features)
npm version minor

# For major updates (breaking changes)
npm version major
```

## Publishing Steps

### 1. Login to NPM

```bash
npm login
# Enter your npm username, password, and email
```

### 2. Build the Project

```bash
# Ensure client is built
npm run client:build

# Verify build output exists
ls -la client/dist/
```

### 3. Test Package Installation

```bash
# Pack the package locally
npm pack

# Test installation from the packed file
npm install -g ./chess-trainer-mcp-1.0.0.tgz

# Test the CLI
chess-trainer-mcp --help
```

### 4. Publish to NPM

```bash
# For first-time publishing
npm publish

# For scoped packages (if needed)
npm publish --access public
```

### 5. Verify Publication

```bash
# Check if package is available
npm view chess-trainer-mcp

# Test installation from npm
npx chess-trainer-mcp@latest --help
```

## Post-Publishing

### 1. Create GitHub Release

```bash
# Tag the release
git tag v1.0.0
git push origin v1.0.0
```

Then create a release on GitHub with:
- Release title: `v1.0.0 - Initial Release`
- Description of changes
- Installation instructions

### 2. Update Documentation

Update README.md with:
- NPM installation badge
- Download statistics
- Version information

### 3. Announce the Release

- Share on relevant forums (chess programming, MCP community)
- Update project documentation
- Consider creating a demo video

## Package Structure for NPM

The published package will include:

```
chess-trainer-mcp/
├── server/                 # Backend server files
├── client/
│   ├── dist/              # Built frontend (production)
│   ├── public/            # Static assets (WASM files)
│   ├── package.json       # Client dependencies
│   └── vite.config.js     # Build configuration
├── bin/
│   └── chess-trainer-mcp  # CLI executable
├── package.json           # Main package configuration
├── README.md              # Documentation
├── DEPLOYMENT.md          # Deployment guide
└── LICENSE                # MIT license
```

## User Installation Experience

After publishing, users can:

```bash
# Run directly without installation
npx chess-trainer-mcp

# Install globally
npm install -g chess-trainer-mcp
chess-trainer-mcp

# Install locally in a project
npm install chess-trainer-mcp
npx chess-trainer-mcp
```

## Troubleshooting

### Common Issues

1. **Package name already exists**
   - Choose a different name in package.json
   - Consider scoped packages: `@username/chess-trainer-mcp`

2. **Large package size**
   - WASM files are large but necessary
   - Ensure .npmignore excludes unnecessary files
   - Consider using npm pack to verify contents

3. **CLI not working after install**
   - Check bin field in package.json
   - Ensure file permissions are correct
   - Verify shebang line in CLI script

4. **Dependencies not installing**
   - Ensure postinstall script works correctly
   - Test with clean npm cache
   - Verify all dependencies are listed

### Version Management

```bash
# Check current version
npm version

# See all versions published
npm view chess-trainer-mcp versions --json

# Unpublish if needed (within 24 hours)
npm unpublish chess-trainer-mcp@1.0.0
```

## Security Considerations

- Never publish with sensitive information
- Use .npmignore to exclude development files
- Regularly update dependencies for security
- Consider using npm audit before publishing

## Maintenance

- Monitor download statistics
- Respond to GitHub issues
- Keep dependencies updated
- Test with different Node.js versions
- Consider automated publishing with GitHub Actions 