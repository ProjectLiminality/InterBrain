# InterBrain Git Error Handling Architecture

## Overview

This document outlines the comprehensive error handling patterns for git operations in the InterBrain Obsidian plugin. The system is designed to protect non-technical users (poets, artists, philosophers, grandparents) from git complexity while providing robust recovery mechanisms and AI-powered automatic bug fixing.

## Core Philosophy

- **User-First Language**: Transform technical errors into friendly, actionable messages
- **Automatic Recovery**: Attempt self-healing before bothering the user
- **AI-Powered Resolution**: Leverage AI agents for complex problem solving
- **Progressive Disclosure**: Show simple solutions first, technical details only when needed

## Error Categories & User Messages

### 1. Repository Initialization Errors

```typescript
enum RepoErrorType {
  NOT_INITIALIZED = "NOT_INITIALIZED",
  CORRUPTED = "CORRUPTED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  DISK_FULL = "DISK_FULL"
}

const USER_FRIENDLY_MESSAGES: Record<RepoErrorType, UserMessage> = {
  NOT_INITIALIZED: {
    title: "This Dream needs to be awakened",
    message: "Would you like to initialize this Dream so you can start saving your thoughts?",
    actions: [
      { label: "Awaken Dream", action: "INIT_REPO" },
      { label: "Not now", action: "DISMISS" }
    ]
  },
  CORRUPTED: {
    title: "This Dream seems tangled",
    message: "Something went wrong with this Dream's memory. I can try to repair it or we can start fresh.",
    actions: [
      { label: "Repair Dream", action: "REPAIR_REPO" },
      { label: "Start Fresh", action: "REINIT_REPO" },
      { label: "Get Help", action: "AI_ASSIST" }
    ]
  },
  PERMISSION_DENIED: {
    title: "I need permission to access this Dream",
    message: "Your computer is protecting this Dream. Let me help you grant access.",
    actions: [
      { label: "Grant Access", action: "FIX_PERMISSIONS" },
      { label: "Learn More", action: "SHOW_HELP" }
    ]
  },
  DISK_FULL: {
    title: "Your Dream Garden is full",
    message: "There's no more space to save new Dreams. Let's free up some room.",
    actions: [
      { label: "Free Up Space", action: "MANAGE_STORAGE" },
      { label: "Save Elsewhere", action: "CHANGE_LOCATION" }
    ]
  }
};
```

### 2. Save (Commit) Errors

```typescript
enum SaveErrorType {
  NOTHING_TO_SAVE = "NOTHING_TO_SAVE",
  CONFLICTS = "CONFLICTS",
  NETWORK_ERROR = "NETWORK_ERROR",
  HOOK_FAILURE = "HOOK_FAILURE"
}

const SAVE_ERROR_MESSAGES: Record<SaveErrorType, UserMessage> = {
  NOTHING_TO_SAVE: {
    title: "Everything is already saved",
    message: "Your Dream is up to date. Make some changes and I'll help you save them.",
    actions: [
      { label: "OK", action: "DISMISS" }
    ]
  },
  CONFLICTS: {
    title: "Two versions of this Dream exist",
    message: "Someone else edited this Dream while you were working. I can help merge your ideas together.",
    actions: [
      { label: "Merge Ideas", action: "AUTO_MERGE" },
      { label: "Keep My Version", action: "FORCE_SAVE" },
      { label: "See Both Versions", action: "SHOW_DIFF" },
      { label: "Ask AI for Help", action: "AI_MERGE" }
    ]
  },
  NETWORK_ERROR: {
    title: "Can't reach the Dream Cloud",
    message: "I'll save your changes locally and sync them when we're back online.",
    actions: [
      { label: "Save Locally", action: "LOCAL_SAVE" },
      { label: "Try Again", action: "RETRY" }
    ]
  },
  HOOK_FAILURE: {
    title: "Something interrupted the save",
    message: "A helper process had trouble. I can try again or save without it.",
    actions: [
      { label: "Try Again", action: "RETRY" },
      { label: "Save Anyway", action: "SKIP_HOOKS" },
      { label: "Fix Issue", action: "AI_DIAGNOSE" }
    ]
  }
};
```

## Error Handling Pipeline

```typescript
interface ErrorContext {
  operation: GitOperation;
  repository: DreamNode;
  error: Error;
  retryCount: number;
  userProfile: UserProfile;
}

class GitErrorHandler {
  private retryPolicy = new ExponentialBackoff({
    initialDelay: 1000,
    maxDelay: 30000,
    maxRetries: 3
  });

  async handleError(context: ErrorContext): Promise<ErrorResolution> {
    // 1. Classify the error
    const errorType = this.classifyError(context.error);
    
    // 2. Attempt automatic recovery
    const autoRecovery = await this.attemptAutoRecovery(errorType, context);
    if (autoRecovery.success) {
      return autoRecovery;
    }
    
    // 3. Check if we should retry
    if (this.shouldRetry(errorType) && context.retryCount < this.retryPolicy.maxRetries) {
      return await this.retryWithBackoff(context);
    }
    
    // 4. Present user-friendly options
    const userChoice = await this.presentUserOptions(errorType, context);
    
    // 5. Execute user's choice
    return await this.executeUserChoice(userChoice, context);
  }

  private async attemptAutoRecovery(
    errorType: ErrorType, 
    context: ErrorContext
  ): Promise<ErrorResolution> {
    switch (errorType) {
      case RepoErrorType.NOT_INITIALIZED:
        return await this.autoInitRepository(context.repository);
        
      case RepoErrorType.PERMISSION_DENIED:
        return await this.autoFixPermissions(context.repository);
        
      case SaveErrorType.NETWORK_ERROR:
        return await this.enableOfflineMode(context);
        
      case SaveErrorType.CONFLICTS:
        if (this.canAutoMerge(context)) {
          return await this.performAutoMerge(context);
        }
        break;
    }
    
    return { success: false };
  }
}
```

## Retry Mechanisms

```typescript
class ExponentialBackoff {
  constructor(
    private config: {
      initialDelay: number;
      maxDelay: number;
      maxRetries: number;
      factor?: number;
    }
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    isRetryable: (error: Error) => boolean
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (!isRetryable(error as Error) || attempt === this.config.maxRetries) {
          throw error;
        }
        
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  private calculateDelay(attempt: number): number {
    const factor = this.config.factor || 2;
    const delay = this.config.initialDelay * Math.pow(factor, attempt);
    return Math.min(delay, this.config.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Retryable error detection
const RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'LOCK_EXIST'
];

function isRetryableError(error: Error): boolean {
  return RETRYABLE_ERRORS.some(code => 
    error.message.includes(code) || error.code === code
  );
}
```

## Recovery Strategies

### 1. Repository Repair

```typescript
class RepositoryDoctor {
  async diagnoseAndRepair(repoPath: string): Promise<RepairResult> {
    const diagnostics = await this.runDiagnostics(repoPath);
    
    for (const issue of diagnostics.issues) {
      try {
        await this.repairIssue(issue, repoPath);
      } catch (error) {
        // Log for AI analysis
        await this.logForAIAnalysis(issue, error);
      }
    }
    
    return {
      success: diagnostics.issues.every(i => i.repaired),
      repairedIssues: diagnostics.issues.filter(i => i.repaired),
      failedIssues: diagnostics.issues.filter(i => !i.repaired)
    };
  }

  private async runDiagnostics(repoPath: string): Promise<Diagnostics> {
    const checks = [
      this.checkGitDirectory,
      this.checkHEAD,
      this.checkRefs,
      this.checkObjects,
      this.checkIndex,
      this.checkConfig
    ];
    
    const issues: Issue[] = [];
    
    for (const check of checks) {
      const issue = await check(repoPath);
      if (issue) issues.push(issue);
    }
    
    return { issues };
  }

  private async repairIssue(issue: Issue, repoPath: string): Promise<void> {
    switch (issue.type) {
      case 'MISSING_GIT_DIR':
        await this.recreateGitDirectory(repoPath);
        break;
        
      case 'CORRUPTED_HEAD':
        await this.repairHEAD(repoPath);
        break;
        
      case 'BROKEN_REFS':
        await this.rebuildRefs(repoPath);
        break;
        
      case 'CORRUPTED_INDEX':
        await this.rebuildIndex(repoPath);
        break;
    }
    
    issue.repaired = true;
  }
}
```

### 2. Conflict Resolution

```typescript
class ConflictResolver {
  async resolveConflicts(
    repoPath: string,
    strategy: MergeStrategy
  ): Promise<ConflictResolution> {
    const conflicts = await this.detectConflicts(repoPath);
    
    if (conflicts.length === 0) {
      return { success: true, resolved: [] };
    }
    
    // Try automatic resolution first
    if (strategy === MergeStrategy.AUTO) {
      const autoResolved = await this.autoResolveConflicts(conflicts);
      if (autoResolved.allResolved) {
        return { success: true, resolved: conflicts };
      }
    }
    
    // Fall back to AI assistance
    if (strategy === MergeStrategy.AI_ASSISTED) {
      return await this.aiAssistedResolve(conflicts);
    }
    
    // Present visual merge tool
    return await this.visualMergeResolve(conflicts);
  }

  private async aiAssistedResolve(
    conflicts: Conflict[]
  ): Promise<ConflictResolution> {
    const context = await this.gatherMergeContext(conflicts);
    
    const aiSuggestions = await this.requestAIMerge({
      conflicts,
      context,
      userIntent: await this.inferUserIntent()
    });
    
    // Present AI suggestions to user
    const userApproval = await this.presentAISuggestions(aiSuggestions);
    
    if (userApproval.approved) {
      await this.applyAISuggestions(aiSuggestions);
      return { success: true, resolved: conflicts };
    }
    
    return { success: false, resolved: [] };
  }
}
```

## AI-Powered Bug Fixing Pipeline

```typescript
interface BugReport {
  error: Error;
  context: ErrorContext;
  systemInfo: SystemInfo;
  userActions: UserAction[];
  logs: LogEntry[];
}

class AIBugFixingPipeline {
  private githubIntegration: GitHubIntegration;
  private aiAnalyzer: AIErrorAnalyzer;
  
  async handleUnrecoverableError(report: BugReport): Promise<void> {
    // 1. Sanitize sensitive information
    const sanitizedReport = await this.sanitizeReport(report);
    
    // 2. AI analysis
    const analysis = await this.aiAnalyzer.analyze(sanitizedReport);
    
    // 3. Check for known issues
    const existingIssue = await this.findExistingIssue(analysis);
    
    if (existingIssue) {
      // Update existing issue with new occurrence
      await this.updateIssue(existingIssue, sanitizedReport);
    } else {
      // Create new issue with AI-generated description
      const issue = await this.createIssue({
        title: analysis.suggestedTitle,
        body: this.formatIssueBody(analysis, sanitizedReport),
        labels: analysis.suggestedLabels,
        priority: analysis.severity
      });
      
      // 4. Attempt AI-generated fix
      if (analysis.possibleFix) {
        await this.attemptAutomaticFix(issue, analysis.possibleFix);
      }
    }
    
    // 5. Notify user of progress
    await this.notifyUser({
      message: "I've reported this issue and I'm working on a fix. You'll be notified when it's ready.",
      issueUrl: issue.url
    });
  }

  private async attemptAutomaticFix(
    issue: GitHubIssue,
    suggestedFix: AISuggestedFix
  ): Promise<void> {
    // Create a branch for the fix
    const branch = await this.createFixBranch(issue);
    
    // Apply AI-suggested changes
    const changes = await this.applyAIChanges(suggestedFix, branch);
    
    // Run tests
    const testResults = await this.runTests(branch);
    
    if (testResults.passed) {
      // Create pull request
      await this.createPullRequest({
        branch,
        issue,
        description: suggestedFix.explanation,
        testResults
      });
    } else {
      // Add test results to issue for human intervention
      await this.addCommentToIssue(issue, {
        body: `AI attempted fix failed tests:\n${testResults.summary}`
      });
    }
  }
}
```

## User Experience Patterns

### 1. Progressive Disclosure

```typescript
class ErrorPresenter {
  async presentError(
    error: UserFriendlyError,
    userProfile: UserProfile
  ): Promise<UserChoice> {
    // Start with simplest message
    let presentation = this.getSimplePresentation(error);
    
    // Add technical details button for advanced users
    if (userProfile.techLevel >= TechLevel.INTERMEDIATE) {
      presentation.showDetailsButton = true;
    }
    
    // Add AI assist option for complex errors
    if (error.complexity >= ErrorComplexity.HIGH) {
      presentation.actions.push({
        label: "Ask AI for Help",
        action: "AI_ASSIST",
        icon: "robot"
      });
    }
    
    return await this.showErrorDialog(presentation);
  }
}
```

### 2. Contextual Help

```typescript
class ContextualHelper {
  async provideHelp(error: ErrorType, context: ErrorContext): Promise<void> {
    const helpContent = await this.generateHelpContent(error, context);
    
    // Show inline tips
    if (helpContent.tips.length > 0) {
      await this.showInlineTips(helpContent.tips);
    }
    
    // Offer video tutorial for complex issues
    if (helpContent.videoTutorial) {
      await this.offerVideoTutorial(helpContent.videoTutorial);
    }
    
    // Connect with community for human help
    if (context.retryCount > 2) {
      await this.offerCommunityHelp({
        error,
        context,
        similarIssues: await this.findSimilarIssues(error)
      });
    }
  }
}
```

## Logging and Telemetry

```typescript
class ErrorTelemetry {
  private logger: Logger;
  private analytics: Analytics;
  
  async logError(
    error: Error,
    context: ErrorContext,
    resolution: ErrorResolution
  ): Promise<void> {
    // Local logging for debugging
    await this.logger.error({
      timestamp: new Date(),
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      context: this.sanitizeContext(context),
      resolution
    });
    
    // Anonymous telemetry for improvement
    if (context.userProfile.telemetryEnabled) {
      await this.analytics.track('error_occurred', {
        errorType: this.classifyError(error),
        operation: context.operation,
        resolved: resolution.success,
        resolutionMethod: resolution.method,
        retryCount: context.retryCount
      });
    }
    
    // Proactive error detection
    await this.checkErrorPatterns(error, context);
  }
  
  private async checkErrorPatterns(
    error: Error,
    context: ErrorContext
  ): Promise<void> {
    const recentErrors = await this.getRecentErrors();
    const pattern = this.detectPattern(error, recentErrors);
    
    if (pattern && pattern.frequency > PATTERN_THRESHOLD) {
      await this.triggerProactivefix(pattern);
    }
  }
}
```

## Integration Examples

### 1. Save Operation with Full Error Handling

```typescript
class DreamSaver {
  private errorHandler: GitErrorHandler;
  private telemetry: ErrorTelemetry;
  
  async saveDream(
    dreamNode: DreamNode,
    message?: string
  ): Promise<SaveResult> {
    const context: ErrorContext = {
      operation: GitOperation.COMMIT,
      repository: dreamNode,
      error: null!,
      retryCount: 0,
      userProfile: await this.getUserProfile()
    };
    
    try {
      // Pre-flight checks
      await this.performPreflightChecks(dreamNode);
      
      // Attempt save
      const result = await this.performGitCommit(dreamNode, message);
      
      // Success telemetry
      await this.telemetry.logSuccess(context);
      
      return result;
      
    } catch (error) {
      context.error = error as Error;
      
      // Handle with full pipeline
      const resolution = await this.errorHandler.handleError(context);
      
      // Log resolution
      await this.telemetry.logError(error as Error, context, resolution);
      
      if (!resolution.success) {
        throw new UserFriendlyError(
          "Unable to save your Dream",
          "Don't worry, your changes are safe. I'll help you resolve this.",
          resolution.suggestedActions
        );
      }
      
      return resolution.result as SaveResult;
    }
  }
}
```

### 2. Coherence Beacon with Network Resilience

```typescript
class CoherenceBeaconHandler {
  async triggerBeacon(
    dreamNode: DreamNode,
    options: BeaconOptions
  ): Promise<BeaconResult> {
    const offlineQueue = new OfflineQueue();
    
    try {
      // Check network status
      if (!await this.isOnline()) {
        // Queue for later
        await offlineQueue.enqueue({
          operation: 'COHERENCE_BEACON',
          dreamNode,
          options,
          timestamp: new Date()
        });
        
        return {
          success: true,
          queued: true,
          message: "Your beacon will shine when you're back online"
        };
      }
      
      // Attempt beacon trigger
      return await this.performBeaconTrigger(dreamNode, options);
      
    } catch (error) {
      if (this.isNetworkError(error)) {
        // Graceful degradation
        return await this.handleOfflineBeacon(dreamNode, options);
      }
      
      throw error;
    }
  }
}
```

## Error Recovery State Machine

```typescript
enum RecoveryState {
  INITIAL = "INITIAL",
  AUTO_RECOVERING = "AUTO_RECOVERING",
  USER_INTERVENTION = "USER_INTERVENTION",
  AI_ASSISTANCE = "AI_ASSISTANCE",
  RESOLVED = "RESOLVED",
  ESCALATED = "ESCALATED"
}

class ErrorRecoveryStateMachine {
  private state: RecoveryState = RecoveryState.INITIAL;
  
  async transition(
    event: RecoveryEvent,
    context: ErrorContext
  ): Promise<RecoveryState> {
    switch (this.state) {
      case RecoveryState.INITIAL:
        if (event.type === 'ERROR_DETECTED') {
          this.state = RecoveryState.AUTO_RECOVERING;
          await this.startAutoRecovery(context);
        }
        break;
        
      case RecoveryState.AUTO_RECOVERING:
        if (event.type === 'AUTO_RECOVERY_FAILED') {
          this.state = RecoveryState.USER_INTERVENTION;
          await this.requestUserIntervention(context);
        } else if (event.type === 'AUTO_RECOVERY_SUCCESS') {
          this.state = RecoveryState.RESOLVED;
        }
        break;
        
      case RecoveryState.USER_INTERVENTION:
        if (event.type === 'USER_REQUESTED_AI_HELP') {
          this.state = RecoveryState.AI_ASSISTANCE;
          await this.initiateAIAssistance(context);
        } else if (event.type === 'USER_RESOLVED') {
          this.state = RecoveryState.RESOLVED;
        }
        break;
        
      case RecoveryState.AI_ASSISTANCE:
        if (event.type === 'AI_RESOLUTION_FAILED') {
          this.state = RecoveryState.ESCALATED;
          await this.escalateToCommunity(context);
        } else if (event.type === 'AI_RESOLVED') {
          this.state = RecoveryState.RESOLVED;
        }
        break;
    }
    
    return this.state;
  }
}
```

## Testing Error Scenarios

```typescript
class ErrorScenarioTester {
  async testAllErrorPaths(): Promise<TestResults> {
    const scenarios: ErrorScenario[] = [
      {
        name: "Uninitialized repository",
        setup: () => this.createUninitializedRepo(),
        operation: () => this.attemptSave(),
        expectedRecovery: RecoveryMethod.AUTO_INIT
      },
      {
        name: "Network timeout during push",
        setup: () => this.simulateNetworkTimeout(),
        operation: () => this.attemptPush(),
        expectedRecovery: RecoveryMethod.OFFLINE_QUEUE
      },
      {
        name: "Merge conflict with AI resolution",
        setup: () => this.createMergeConflict(),
        operation: () => this.attemptMerge(),
        expectedRecovery: RecoveryMethod.AI_MERGE
      }
      // ... more scenarios
    ];
    
    const results: TestResult[] = [];
    
    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);
    }
    
    return {
      passed: results.filter(r => r.passed),
      failed: results.filter(r => !r.passed),
      coverage: this.calculateCoverage(results)
    };
  }
}
```

## Summary

This error handling architecture provides:

1. **User-Friendly Abstractions**: Technical errors become friendly messages with clear actions
2. **Automatic Recovery**: System attempts self-healing before bothering users
3. **Progressive Escalation**: Simple fixes → User intervention → AI assistance → Community help
4. **Robust Retry Logic**: Exponential backoff for transient failures
5. **AI Integration**: Automatic bug reporting and fix attempts via GitHub
6. **Offline Resilience**: Graceful degradation when network is unavailable
7. **Comprehensive Logging**: Telemetry for proactive error detection and resolution

The system treats errors as opportunities to improve the user experience, automatically learning from failures and evolving to prevent future issues.