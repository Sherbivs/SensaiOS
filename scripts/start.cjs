#!/usr/bin/env node
// Robust start script that finds project root and starts the bot
// Handles Render's working directory issues

const fs = require('fs');
const path = require('path');

/**
 * Find the project root directory
 * CRITICAL: Check absolute Render path FIRST to avoid false positives
 * npm install may create package.json files in subdirectories
 */
function findProjectRoot() {
  console.log('🔍 Searching for project root...');
  console.log('   Current working directory:', process.cwd());
  
  // DEBUG: List Render directory structure
  console.log('\n🔍 DEBUG: Exploring Render filesystem...');
  if (fs.existsSync('/opt/render/project')) {
    console.log('   /opt/render/project/ contents:');
    try {
      const files = fs.readdirSync('/opt/render/project');
      files.slice(0, 20).forEach(f => {
        const fullPath = path.join('/opt/render/project', f);
        const isDir = fs.statSync(fullPath).isDirectory();
        console.log(`     ${isDir ? '[DIR]' : '[FILE]'} ${f}`);
      });
    } catch (err) {
      console.log(`     Error listing: ${err.message}`);
    }
  }
  
  if (fs.existsSync('/opt/render/project/src')) {
    console.log('   /opt/render/project/src/ contents:');
    try {
      const files = fs.readdirSync('/opt/render/project/src');
      files.slice(0, 15).forEach(f => {
        const fullPath = path.join('/opt/render/project/src', f);
        const isDir = fs.statSync(fullPath).isDirectory();
        console.log(`     ${isDir ? '[DIR]' : '[FILE]'} ${f}`);
      });
    } catch (err) {
      console.log(`     Error listing: ${err.message}`);
    }
  }
  console.log();
  
  // 1. Check absolute Render deployment path FIRST
  const renderPath = '/opt/render/project';
  if (fs.existsSync(renderPath)) {
    const renderPkg = path.join(renderPath, 'package.json');
    const renderSrc = path.join(renderPath, 'src');
    const renderDist = path.join(renderPath, 'dist');
    
    console.log(`   Checking Render path: ${renderPath}`);
    console.log(`     - package.json exists: ${fs.existsSync(renderPkg)}`);
    console.log(`     - src/ exists: ${fs.existsSync(renderSrc)}`);
    console.log(`     - dist/ exists: ${fs.existsSync(renderDist)}`);
    
    if (fs.existsSync(renderPkg) && fs.existsSync(renderSrc)) {
      console.log(`   ✓ Found project root at: ${renderPath}`);
      return renderPath;
    }
  }
  
  // 2. Check parent directories (for local development)
  const searchPaths = [
    path.resolve('..'),
    path.resolve('../..'),
    path.resolve('.')
  ];
  
  for (const searchPath of searchPaths) {
    const pkgPath = path.join(searchPath, 'package.json');
    const srcPath = path.join(searchPath, 'src');
    const distPath = path.join(searchPath, 'dist');
    
    console.log(`   Checking: ${searchPath}`);
    
    if (fs.existsSync(pkgPath) && fs.existsSync(srcPath)) {
      // Verify it's the main package.json (has our scripts)
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'infinity-gauntlet') {
          console.log(`   ✓ Found project root at: ${searchPath}`);
          return searchPath;
        }
      } catch (err) {
        console.log(`   ✗ Invalid package.json: ${err.message}`);
      }
    }
  }
  
  return null;
}

/**
 * Main execution
 */
function main() {
  console.log('🚀 Infinity Gauntlet Bot - Starting...\n');
  
  // Find project root
  const projectRoot = findProjectRoot();
  
  if (!projectRoot) {
    console.error('\n❌ FATAL: Cannot find project root!');
    console.error('   Searched paths:');
    console.error('     - /opt/render/project');
    console.error('     - ' + path.resolve('..'));
    console.error('     - ' + path.resolve('../..'));
    console.error('     - ' + path.resolve('.'));
    console.error('\n   Requirements:');
    console.error('     - package.json must exist');
    console.error('     - src/ directory must exist');
    console.error('     - package.json name must be "infinity-gauntlet"');
    process.exit(1);
  }
  
  // Verify dist/index.js exists
  const distPath = path.join(projectRoot, 'dist', 'index.js');
  console.log(`\n📦 Looking for compiled output...`);
  console.log(`   Expected path: ${distPath}`);
  
  if (!fs.existsSync(distPath)) {
    console.error('\n❌ FATAL: Compiled output not found!');
    console.error(`   Expected: ${distPath}`);
    console.error(`\n   Project root: ${projectRoot}`);
    
    // Debug info
    const distDir = path.join(projectRoot, 'dist');
    if (fs.existsSync(distDir)) {
      console.error('\n   dist/ directory exists but index.js is missing');
      console.error('   Contents of dist/:');
      const files = fs.readdirSync(distDir).slice(0, 20);
      files.forEach(f => console.error(`     - ${f}`));
    } else {
      console.error('\n   dist/ directory does not exist!');
      console.error('   TypeScript compilation may have failed.');
    }
    
    console.error('\n   Files in project root:');
    const rootFiles = fs.readdirSync(projectRoot).slice(0, 20);
    rootFiles.forEach(f => console.error(`     - ${f}`));
    
    process.exit(1);
  }
  
  console.log(`   ✓ Found: ${distPath}`);
  
  // CRITICAL: Change working directory to project root BEFORE requiring
  // This ensures ES module imports resolve correctly
  console.log(`\n📂 Changing working directory to: ${projectRoot}`);
  process.chdir(projectRoot);
  console.log(`   ✓ Working directory set`);
  console.log(`   Current directory: ${process.cwd()}`);
  
  // Start the bot
  console.log(`\n▶️  Starting bot from: ${distPath}\n`);
  console.log('═'.repeat(60));
  
  // Convert to file:// URL for ES module import
  const { pathToFileURL } = require('url');
  const distUrl = pathToFileURL(distPath).href;
  
  // Use dynamic import for ES modules with top-level await
  import(distUrl).catch(err => {
    console.error('\n❌ FATAL: Failed to start bot!');
    console.error(`   Error: ${err.message}`);
    console.error(`\n   Stack trace:`);
    console.error(err.stack);
    process.exit(1);
  });
}

// Run
main();
