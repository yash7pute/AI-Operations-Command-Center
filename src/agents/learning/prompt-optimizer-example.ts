/**
 * Prompt Optimizer - Example Usage and Tests
 * 
 * Demonstrates the key functionality of the PromptOptimizer:
 * - Feedback analysis
 * - Prompt optimization
 * - A/B testing
 * - Version management
 */

import { 
  getPromptOptimizer,
  getCurrentPromptVersion,
  optimizeClassificationPrompt,
  optimizeDecisionPrompt,
  type PromptType,
  type OptimizationAttempt,
} from './prompt-optimizer';

import { getFeedbackTracker } from './feedback-tracker';

// ============================================================================
// Example Usage
// ============================================================================

async function demonstratePromptOptimization() {
  console.log('='.repeat(70));
  console.log('PROMPT OPTIMIZER - DEMONSTRATION');
  console.log('='.repeat(70));
  console.log();
  
  // Get optimizer instance
  const optimizer = getPromptOptimizer();
  console.log('✓ Initialized PromptOptimizer\n');
  
  // 1. Get Current Prompts
  console.log('1. Current Prompt Versions');
  console.log('-'.repeat(70));
  
  const classificationPrompt = getCurrentPromptVersion('classification');
  const decisionPrompt = getCurrentPromptVersion('decision');
  
  console.log(`Classification Prompt v${classificationPrompt.version}:`);
  console.log(`  - Examples: ${classificationPrompt.examples.length}`);
  console.log(`  - Max Examples: ${classificationPrompt.maxExamples}`);
  console.log();
  
  console.log(`Decision Prompt v${decisionPrompt.version}:`);
  console.log(`  - Examples: ${decisionPrompt.examples.length}`);
  console.log(`  - Max Examples: ${decisionPrompt.maxExamples}`);
  console.log();
  
  // 2. Check Feedback Availability
  console.log('2. Feedback Data');
  console.log('-'.repeat(70));
  
  const feedbackTracker = getFeedbackTracker();
  const allFeedback = feedbackTracker.getAllFeedback();
  
  console.log(`Total Feedback Records: ${allFeedback.length}`);
  
  if (allFeedback.length > 0) {
    const successCount = allFeedback.filter(f => f.outcome === 'success').length;
    const failureCount = allFeedback.filter(f => f.outcome === 'failure').length;
    const modifiedCount = allFeedback.filter(f => f.outcome === 'modified').length;
    
    console.log(`  - Success: ${successCount} (${(successCount/allFeedback.length*100).toFixed(1)}%)`);
    console.log(`  - Failure: ${failureCount} (${(failureCount/allFeedback.length*100).toFixed(1)}%)`);
    console.log(`  - Modified: ${modifiedCount} (${(modifiedCount/allFeedback.length*100).toFixed(1)}%)`);
  }
  console.log();
  
  // 3. Optimization History
  console.log('3. Optimization History');
  console.log('-'.repeat(70));
  
  const history = optimizer.getOptimizationHistory();
  console.log(`Total Optimization Attempts: ${history.length}`);
  
  if (history.length > 0) {
    const applied = history.filter(h => h.applied && !h.rolledBack).length;
    const rolledBack = history.filter(h => h.rolledBack).length;
    
    console.log(`  - Successfully Applied: ${applied}`);
    console.log(`  - Rolled Back: ${rolledBack}`);
    
    const lastAttempt = history[history.length - 1];
    console.log(`\nLast Optimization (${lastAttempt.type}):`);
    console.log(`  - Version: v${lastAttempt.previousVersion} → v${lastAttempt.newVersion}`);
    console.log(`  - Examples Added: ${lastAttempt.changes.examplesAdded.length}`);
    console.log(`  - Examples Removed: ${lastAttempt.changes.examplesRemoved.length}`);
    console.log(`  - Applied: ${lastAttempt.applied ? 'Yes' : 'No'}`);
    
    if (lastAttempt.validation) {
      const delta = lastAttempt.validation.performanceDelta;
      console.log(`  - Performance Change: ${delta > 0 ? '+' : ''}${(delta * 100).toFixed(2)}%`);
    }
  }
  console.log();
  
  // 4. Active A/B Tests
  console.log('4. A/B Testing');
  console.log('-'.repeat(70));
  
  const activeTests = optimizer.getActiveABTests();
  console.log(`Active A/B Tests: ${activeTests.length}`);
  
  if (activeTests.length > 0) {
    activeTests.forEach(test => {
      console.log(`\nTest: ${test.id}`);
      console.log(`  - Type: ${test.type}`);
      console.log(`  - Control: v${test.controlVersion}`);
      console.log(`  - Treatment: v${test.treatmentVersion}`);
      console.log(`  - Traffic Split: ${100 - test.treatmentPercentage}% / ${test.treatmentPercentage}%`);
      console.log(`  - Status: ${test.status}`);
      
      if (test.results) {
        console.log(`  - Winner: ${test.results.winner}`);
        console.log(`  - Control Success Rate: ${(test.results.control.successRate * 100).toFixed(1)}%`);
        console.log(`  - Treatment Success Rate: ${(test.results.treatment.successRate * 100).toFixed(1)}%`);
      }
    });
  }
  console.log();
  
  // 5. Performance Summary
  console.log('5. Performance Summary');
  console.log('-'.repeat(70));
  
  const classificationSummary = optimizer.getPromptPerformanceSummary('classification');
  const decisionSummary = optimizer.getPromptPerformanceSummary('decision');
  
  console.log('Classification:');
  console.log(`  - Current Version: v${classificationSummary.currentVersion}`);
  console.log(`  - Total Optimizations: ${classificationSummary.totalOptimizations}`);
  console.log(`  - Successful: ${classificationSummary.successfulOptimizations}`);
  console.log(`  - Active A/B Test: ${classificationSummary.activeABTest ? 'Yes' : 'No'}`);
  
  if (classificationSummary.metrics) {
    console.log(`  - Success Rate: ${(classificationSummary.metrics.successRate * 100).toFixed(1)}%`);
  }
  console.log();
  
  console.log('Decision:');
  console.log(`  - Current Version: v${decisionSummary.currentVersion}`);
  console.log(`  - Total Optimizations: ${decisionSummary.totalOptimizations}`);
  console.log(`  - Successful: ${decisionSummary.successfulOptimizations}`);
  console.log(`  - Active A/B Test: ${decisionSummary.activeABTest ? 'Yes' : 'No'}`);
  
  if (decisionSummary.metrics) {
    console.log(`  - Success Rate: ${(decisionSummary.metrics.successRate * 100).toFixed(1)}%`);
  }
  console.log();
  
  // 6. Demonstrate Prompt Selection (A/B Testing)
  console.log('6. Prompt Selection (A/B Test Simulation)');
  console.log('-'.repeat(70));
  
  const selections = { control: 0, treatment: 0 };
  const sampleSize = 100;
  
  for (let i = 0; i < sampleSize; i++) {
    const selectedPrompt = optimizer.selectPromptForSignal('classification');
    if (selectedPrompt.version === classificationPrompt.version) {
      selections.control++;
    } else {
      selections.treatment++;
    }
  }
  
  console.log(`Simulated ${sampleSize} selections:`);
  console.log(`  - Control (v${classificationPrompt.version}): ${selections.control} (${selections.control}%)`);
  console.log(`  - Treatment: ${selections.treatment} (${selections.treatment}%)`);
  console.log();
  
  console.log('='.repeat(70));
  console.log('DEMONSTRATION COMPLETE');
  console.log('='.repeat(70));
}

// ============================================================================
// Run Demonstration
// ============================================================================

if (require.main === module) {
  demonstratePromptOptimization().catch(error => {
    console.error('Error in demonstration:', error);
    process.exit(1);
  });
}

export { demonstratePromptOptimization };
