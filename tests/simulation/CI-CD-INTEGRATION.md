# 🚀 CI/CD Integration Guide - Simulation Framework

**Purpose:** Configure continuous integration and deployment for automated simulation testing  
**Audience:** DevOps engineers, CI/CD administrators  
**Last Updated:** November 28, 2025

---

## 📋 Overview

This guide shows how to integrate the simulation test framework into your CI/CD pipeline. The framework is designed to run in automated environments with zero configuration and predictable behavior.

**Key Features:**
- ✅ Zero external dependencies (in-memory SQLite)
- ✅ Fast execution (<10 seconds for full suite)
- ✅ Exit codes for pipeline control (0=success, 1=failure)
- ✅ Multiple report formats (JSON, HTML, Markdown)
- ✅ Parallel execution support
- ✅ Category filtering (core, integration, stress)

---

## 🔧 GitHub Actions

### Basic Workflow

```yaml
# .github/workflows/simulation-tests.yml
name: Simulation Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  simulation-tests:
    name: Run Simulation Tests
    runs-on: ubuntu-latest
    timeout-minutes: 5
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run simulation tests
        run: npm run test:sim -- --bail
      
      - name: Check test status
        if: failure()
        run: echo "Simulation tests failed. Check logs above."
```

### Advanced Workflow with Reports

```yaml
# .github/workflows/simulation-tests-advanced.yml
name: Simulation Tests (Advanced)

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  simulation-tests:
    name: Run Simulation Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    
    strategy:
      matrix:
        category: [core, integration, stress]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ${{ matrix.category }} tests
        run: npm run test:sim -- --category=${{ matrix.category }} --verbose
      
      - name: Generate HTML report
        if: always()
        run: |
          node -e "
            import('./tests/simulation/test-runner.js').then(m => 
              new m.TestRunner().runAll({ 
                categories: ['${{ matrix.category }}'] 
              }).then(summary =>
                import('./tests/simulation/report-generator.js').then(r =>
                  new r.ReportGenerator().saveReport(summary, 'html')
                )
              )
            )
          "
      
      - name: Upload HTML report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: simulation-report-${{ matrix.category }}
          path: reports/*.html
          retention-days: 30
      
      - name: Generate JSON report
        if: always()
        run: npm run test:sim -- --category=${{ matrix.category }} > reports/${{ matrix.category }}-results.json
      
      - name: Upload JSON report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: simulation-results-${{ matrix.category }}
          path: reports/${{ matrix.category }}-results.json
          retention-days: 30
```

### PR Comment Workflow

Automatically comment on PRs with test results:

```yaml
# .github/workflows/simulation-pr-comment.yml
name: Simulation Test Results Comment

on:
  workflow_run:
    workflows: ["Simulation Tests"]
    types:
      - completed

jobs:
  comment:
    name: Comment Test Results
    runs-on: ubuntu-latest
    if: github.event.workflow_run.event == 'pull_request'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Download test results
        uses: actions/download-artifact@v3
        with:
          name: simulation-results
          path: reports/
      
      - name: Generate Markdown report
        run: |
          node -e "
            import('./tests/simulation/report-generator.js').then(r => {
              const fs = require('fs');
              const results = JSON.parse(fs.readFileSync('reports/results.json', 'utf8'));
              const report = new r.ReportGenerator().generateMarkdownReport(results);
              fs.writeFileSync('reports/comment.md', report);
            })
          "
      
      - name: Comment on PR
        uses: actions/github-script@v6
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const comment = fs.readFileSync('reports/comment.md', 'utf8');
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## 🎮 Simulation Test Results\n\n${comment}`
            });
```

---

## 🎯 GitLab CI/CD

### Basic Pipeline

```yaml
# .gitlab-ci.yml
stages:
  - test

simulation-tests:
  stage: test
  image: node:18
  timeout: 5 minutes
  
  before_script:
    - npm ci
  
  script:
    - npm run test:sim -- --bail
  
  artifacts:
    when: always
    paths:
      - reports/
    expire_in: 30 days
  
  only:
    - merge_requests
    - main
    - develop
```

### Advanced Pipeline with Matrix

```yaml
# .gitlab-ci.yml
stages:
  - test
  - report

.simulation-test-template:
  stage: test
  image: node:18
  timeout: 10 minutes
  
  before_script:
    - npm ci
  
  artifacts:
    when: always
    paths:
      - reports/
    expire_in: 30 days

simulation-test-core:
  extends: .simulation-test-template
  script:
    - npm run test:sim:core -- --verbose
  
simulation-test-integration:
  extends: .simulation-test-template
  script:
    - npm run test:sim:integration -- --verbose
  
simulation-test-stress:
  extends: .simulation-test-template
  script:
    - npm run test:sim:stress -- --verbose

generate-reports:
  stage: report
  image: node:18
  dependencies:
    - simulation-test-core
    - simulation-test-integration
    - simulation-test-stress
  
  script:
    - npm ci
    - |
      node -e "
        import('./tests/simulation/test-runner.js').then(m => 
          new m.TestRunner().runAll().then(summary =>
            import('./tests/simulation/report-generator.js').then(r => {
              const reporter = new r.ReportGenerator();
              reporter.saveReport(summary, 'html');
              reporter.saveReport(summary, 'markdown');
            })
          )
        )
      "
  
  artifacts:
    paths:
      - reports/
    expire_in: 90 days
  
  only:
    - main
```

---

## 🔵 Azure DevOps

### Basic Pipeline

```yaml
# azure-pipelines.yml
trigger:
  - main
  - develop

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '18.x'
    displayName: 'Install Node.js'
  
  - script: npm ci
    displayName: 'Install dependencies'
  
  - script: npm run test:sim -- --bail
    displayName: 'Run simulation tests'
  
  - task: PublishTestResults@2
    condition: always()
    inputs:
      testResultsFormat: 'JUnit'
      testResultsFiles: 'reports/*.xml'
      mergeTestResults: true
      failTaskOnFailedTests: true
    displayName: 'Publish test results'
```

### Advanced Pipeline with Stages

```yaml
# azure-pipelines.yml
trigger:
  - main
  - develop
  - feature/*

stages:
  - stage: Test
    displayName: 'Simulation Tests'
    jobs:
      - job: CoreTests
        displayName: 'Core Scenarios'
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '18.x'
          
          - script: npm ci
            displayName: 'Install dependencies'
          
          - script: npm run test:sim:core -- --verbose
            displayName: 'Run core tests'
          
          - task: PublishBuildArtifacts@1
            condition: always()
            inputs:
              pathToPublish: 'reports'
              artifactName: 'core-test-reports'
      
      - job: IntegrationTests
        displayName: 'Integration Scenarios'
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '18.x'
          
          - script: npm ci
            displayName: 'Install dependencies'
          
          - script: npm run test:sim:integration -- --verbose
            displayName: 'Run integration tests'
          
          - task: PublishBuildArtifacts@1
            condition: always()
            inputs:
              pathToPublish: 'reports'
              artifactName: 'integration-test-reports'
      
      - job: StressTests
        displayName: 'Stress Scenarios'
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '18.x'
          
          - script: npm ci
            displayName: 'Install dependencies'
          
          - script: npm run test:sim:stress -- --verbose
            displayName: 'Run stress tests'
          
          - task: PublishBuildArtifacts@1
            condition: always()
            inputs:
              pathToPublish: 'reports'
              artifactName: 'stress-test-reports'
  
  - stage: Report
    displayName: 'Generate Reports'
    dependsOn: Test
    jobs:
      - job: GenerateReports
        displayName: 'Generate HTML Reports'
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '18.x'
          
          - script: npm ci
            displayName: 'Install dependencies'
          
          - script: |
              node -e "
                import('./tests/simulation/test-runner.js').then(m => 
                  new m.TestRunner().runAll().then(summary =>
                    import('./tests/simulation/report-generator.js').then(r =>
                      new r.ReportGenerator().saveReport(summary, 'html')
                    )
                  )
                )
              "
            displayName: 'Generate HTML report'
          
          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: 'reports'
              artifactName: 'final-reports'
```

---

## 🟢 Jenkins

### Declarative Pipeline

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
    }
    
    stages {
        stage('Setup') {
            steps {
                nodejs(nodeJSInstallationName: "${NODE_VERSION}") {
                    sh 'npm ci'
                }
            }
        }
        
        stage('Simulation Tests') {
            steps {
                nodejs(nodeJSInstallationName: "${NODE_VERSION}") {
                    sh 'npm run test:sim -- --bail'
                }
            }
        }
        
        stage('Generate Reports') {
            when {
                expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
            }
            steps {
                nodejs(nodeJSInstallationName: "${NODE_VERSION}") {
                    sh '''
                        node -e "
                          import('./tests/simulation/test-runner.js').then(m => 
                            new m.TestRunner().runAll().then(summary =>
                              import('./tests/simulation/report-generator.js').then(r =>
                                new r.ReportGenerator().saveReport(summary, 'html')
                              )
                            )
                          )
                        "
                    '''
                }
            }
        }
    }
    
    post {
        always {
            publishHTML([
                reportDir: 'reports',
                reportFiles: '*.html',
                reportName: 'Simulation Test Report',
                keepAll: true
            ])
        }
    }
}
```

### Scripted Pipeline with Matrix

```groovy
// Jenkinsfile
node {
    def categories = ['core', 'integration', 'stress']
    
    stage('Setup') {
        checkout scm
        sh 'npm ci'
    }
    
    stage('Simulation Tests') {
        parallel categories.collectEntries { category ->
            ["Test ${category}": {
                node {
                    sh "npm run test:sim -- --category=${category} --verbose"
                }
            }]
        }
    }
    
    stage('Generate Reports') {
        sh '''
            node -e "
              import('./tests/simulation/test-runner.js').then(m => 
                new m.TestRunner().runAll().then(summary =>
                  import('./tests/simulation/report-generator.js').then(r => {
                    const reporter = new r.ReportGenerator();
                    reporter.saveReport(summary, 'html');
                    reporter.saveReport(summary, 'markdown');
                  })
                )
              )
            "
        '''
        
        publishHTML([
            reportDir: 'reports',
            reportFiles: '*.html',
            reportName: 'Simulation Test Report',
            keepAll: true
        ])
    }
}
```

---

## 📊 Report Integration

### Uploading HTML Reports as Artifacts

**GitHub Actions:**
```yaml
- uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: reports/*.html
```

**GitLab CI:**
```yaml
artifacts:
  paths:
    - reports/
```

**Azure DevOps:**
```yaml
- task: PublishBuildArtifacts@1
  inputs:
    pathToPublish: 'reports'
    artifactName: 'test-reports'
```

### Publishing to GitHub Pages

```yaml
# .github/workflows/publish-reports.yml
name: Publish Test Reports

on:
  push:
    branches: [ main ]

jobs:
  publish:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      
      - name: Generate HTML report
        run: |
          node -e "
            import('./tests/simulation/test-runner.js').then(m => 
              new m.TestRunner().runAll().then(summary =>
                import('./tests/simulation/report-generator.js').then(r =>
                  new r.ReportGenerator().saveReport(summary, 'html')
                )
              )
            )
          "
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./reports
          destination_dir: test-reports
```

### Sending Slack Notifications

```yaml
- name: Send Slack notification
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "Simulation Tests ${{ job.status }}",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Simulation Test Results*\nStatus: ${{ job.status }}\nBranch: ${{ github.ref }}\nCommit: ${{ github.sha }}"
            }
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 🎯 Performance Optimization

### Parallel Execution

Enable parallel test execution for faster CI runs:

```yaml
- name: Run tests in parallel
  run: npm run test:sim:parallel
```

**⚠️ Note:** Parallel execution may use more memory. Monitor CI runner resources.

### Caching Dependencies

Cache npm dependencies to speed up builds:

**GitHub Actions:**
```yaml
- uses: actions/setup-node@v3
  with:
    node-version: '18'
    cache: 'npm'
```

**GitLab CI:**
```yaml
cache:
  paths:
    - node_modules/
```

### Matrix Strategy

Run different test categories in parallel:

```yaml
strategy:
  matrix:
    category: [core, integration, stress]

steps:
  - run: npm run test:sim -- --category=${{ matrix.category }}
```

---

## 🔒 Best Practices

### 1. Always Use `--bail` in CI

Stop on first failure to save CI minutes:

```bash
npm run test:sim -- --bail
```

### 2. Set Appropriate Timeouts

Prevent hung tests from blocking pipelines:

```yaml
timeout-minutes: 5  # Adjust based on your needs
```

### 3. Upload Reports on Failure

Always capture test reports, even on failure:

```yaml
if: always()
```

### 4. Use Exit Codes for Pipeline Control

The test runner exits with:
- `0` on success
- `1` on failure

This integrates naturally with CI/CD tools.

### 5. Generate Multiple Report Formats

- **JSON** for programmatic analysis
- **HTML** for human review
- **Markdown** for PR comments

```bash
# Generate all formats
npm run test:sim -- --report-formats=json,html,markdown
```

### 6. Archive Test Results

Keep historical test data:

```yaml
retention-days: 30  # Adjust based on needs
```

---

## 🚨 Troubleshooting

### Tests Timeout in CI

**Symptom:** Tests exceed CI timeout  
**Solution:** Increase timeout or use parallel execution:

```yaml
timeout-minutes: 10
```

```bash
npm run test:sim:parallel
```

### Out of Memory Errors

**Symptom:** CI runner runs out of memory  
**Solution:** Disable parallel execution or increase memory:

```yaml
- run: npm run test:sim  # Sequential execution
```

### Reports Not Generated

**Symptom:** No artifacts uploaded  
**Solution:** Ensure reports directory exists:

```bash
mkdir -p reports
npm run test:sim
```

### Test Results Not Published

**Symptom:** Test results missing from CI UI  
**Solution:** Check artifact upload configuration:

```yaml
- uses: actions/upload-artifact@v3
  if: always()  # Ensure this runs even on failure
```

---

## 📈 Metrics & Monitoring

### Track Test Performance Over Time

Use CI metrics to monitor test suite health:

- **Duration trends** - Is the suite getting slower?
- **Failure rates** - Are tests becoming flaky?
- **Coverage metrics** - Are new features tested?

### Example Metrics Dashboard

```yaml
# Store metrics in CI artifacts
- name: Export metrics
  run: |
    node -e "
      import('./tests/simulation/test-runner.js').then(m => 
        new m.TestRunner().runAll().then(summary => {
          const fs = require('fs');
          fs.writeFileSync('metrics.json', JSON.stringify({
            timestamp: new Date().toISOString(),
            duration: summary.duration,
            passed: summary.passed,
            failed: summary.failed,
            successRate: summary.successRate
          }));
        })
      )
    "
```

---

## 📝 Summary

**Key Takeaways:**

1. ✅ Framework integrates with all major CI/CD platforms
2. ✅ Zero external dependencies (in-memory SQLite)
3. ✅ Fast execution (<10s for full suite)
4. ✅ Multiple report formats (JSON, HTML, Markdown)
5. ✅ Parallel execution support for faster CI runs
6. ✅ Exit codes for pipeline control
7. ✅ Category filtering for targeted testing

**Next Steps:**

1. Choose your CI/CD platform
2. Copy the appropriate pipeline configuration
3. Customize for your workflow
4. Monitor test performance
5. Iterate and optimize

---

**Document Version:** 1.0.0  
**Last Updated:** November 28, 2025  
**Framework Status:** ✅ Production-Ready
