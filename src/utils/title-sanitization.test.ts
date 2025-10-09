import { describe, it, expect } from 'vitest';
import {
  sanitizeTitleToPascalCase,
  validateTitle,
  isPascalCase,
  pascalCaseToTitle
} from './title-sanitization';

describe('sanitizeTitleToPascalCase', () => {
  it('converts simple titles with spaces', () => {
    expect(sanitizeTitleToPascalCase('Thunderstorm Generator')).toBe('ThunderstormGenerator');
    expect(sanitizeTitleToPascalCase('Dream Node')).toBe('DreamNode');
    expect(sanitizeTitleToPascalCase('My First Idea')).toBe('MyFirstIdea');
  });

  it('handles titles with hyphens', () => {
    expect(sanitizeTitleToPascalCase('Mind-Body Connection')).toBe('MindBodyConnection');
    expect(sanitizeTitleToPascalCase('Self-Driving-Car')).toBe('SelfDrivingCar');
  });

  it('handles titles with underscores', () => {
    expect(sanitizeTitleToPascalCase('machine_learning_model')).toBe('MachineLearningModel');
    expect(sanitizeTitleToPascalCase('deep_neural_net')).toBe('DeepNeuralNet');
  });

  it('handles titles with numbers', () => {
    expect(sanitizeTitleToPascalCase('Dream 2.0')).toBe('Dream20');
    expect(sanitizeTitleToPascalCase('Version 3.14.159')).toBe('Version314159');
    expect(sanitizeTitleToPascalCase('AI Model v2')).toBe('AiModelV2');
  });

  it('handles titles with special characters', () => {
    expect(sanitizeTitleToPascalCase('Café Philosophy')).toBe('CafePhilosophy');
    expect(sanitizeTitleToPascalCase('Niño Project')).toBe('NinoProject');
    expect(sanitizeTitleToPascalCase('Über Idea')).toBe('UberIdea');
  });

  it('handles mixed case input', () => {
    expect(sanitizeTitleToPascalCase('thunderstorm GENERATOR')).toBe('ThunderstormGenerator');
    expect(sanitizeTitleToPascalCase('DREAM node')).toBe('DreamNode');
    expect(sanitizeTitleToPascalCase('MiXeD CaSe')).toBe('MixedCase');
  });

  it('removes multiple consecutive spaces', () => {
    expect(sanitizeTitleToPascalCase('Multiple    Spaces')).toBe('MultipleSpaces');
    expect(sanitizeTitleToPascalCase('Tab\t\tSeparated')).toBe('TabSeparated');
  });

  it('handles leading and trailing whitespace', () => {
    expect(sanitizeTitleToPascalCase('  Leading Spaces')).toBe('LeadingSpaces');
    expect(sanitizeTitleToPascalCase('Trailing Spaces  ')).toBe('TrailingSpaces');
    expect(sanitizeTitleToPascalCase('  Both  ')).toBe('Both');
  });

  it('handles edge case: very long titles', () => {
    const longTitle = 'This Is A Very Long Title That Exceeds The Maximum Length Limit Of One Hundred Characters And Should Be Truncated Properly Without Breaking';
    const result = sanitizeTitleToPascalCase(longTitle);
    expect(result.length).toBeLessThanOrEqual(100);
    // Should be truncated to exactly 100 characters
    expect(result).toBe('ThisIsAVeryLongTitleThatExceedsTheMaximumLengthLimitOfOneHundredCharactersAndShouldBeTruncatedProper');
    expect(result.length).toBe(100);
  });

  it('handles edge case: single word', () => {
    expect(sanitizeTitleToPascalCase('Thunderstorm')).toBe('Thunderstorm');
    expect(sanitizeTitleToPascalCase('dream')).toBe('Dream');
  });

  it('handles edge case: only special characters', () => {
    expect(sanitizeTitleToPascalCase('!@#$%^&*()')).toBe('');
    expect(sanitizeTitleToPascalCase('---')).toBe('');
  });

  it('handles edge case: empty string', () => {
    expect(sanitizeTitleToPascalCase('')).toBe('');
  });

  it('handles real-world example from ThunderstormGenerator', () => {
    expect(sanitizeTitleToPascalCase('Thunderstorm Generator UPDATED COMPLETE DIY BUILD'))
      .toBe('ThunderstormGeneratorUpdatedCompleteDiyBuild');
  });

  it('handles alphanumeric combinations', () => {
    expect(sanitizeTitleToPascalCase('Project 2024 Q1')).toBe('Project2024Q1');
    expect(sanitizeTitleToPascalCase('API v3.2')).toBe('ApiV32');
  });
});

describe('validateTitle', () => {
  it('validates good titles', () => {
    const result = validateTitle('Thunderstorm Generator');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('ThunderstormGenerator');
    expect(result.error).toBeUndefined();
  });

  it('rejects empty titles', () => {
    const result = validateTitle('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Title cannot be empty');
  });

  it('rejects whitespace-only titles', () => {
    const result = validateTitle('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Title cannot be empty');
  });

  it('rejects titles with only special characters', () => {
    const result = validateTitle('!@#$%');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Title must contain at least one alphanumeric character');
  });

  it('accepts titles with some special characters', () => {
    const result = validateTitle('Mind-Body Connection!');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('MindBodyConnection');
  });
});

describe('isPascalCase', () => {
  it('recognizes valid PascalCase', () => {
    expect(isPascalCase('ThunderstormGenerator')).toBe(true);
    expect(isPascalCase('DreamNode')).toBe(true);
    expect(isPascalCase('MyFirstIdea')).toBe(true);
    expect(isPascalCase('Dream20')).toBe(true);
  });

  it('rejects non-PascalCase strings', () => {
    expect(isPascalCase('thunderstorm')).toBe(false); // lowercase
    expect(isPascalCase('THUNDERSTORM')).toBe(true); // all uppercase is technically valid
    expect(isPascalCase('thunderstorm-generator')).toBe(false); // kebab-case
    expect(isPascalCase('Thunderstorm Generator')).toBe(false); // has space
    expect(isPascalCase('Thunderstorm_Generator')).toBe(false); // has underscore
  });

  it('rejects empty strings', () => {
    expect(isPascalCase('')).toBe(false);
  });

  it('handles edge cases', () => {
    expect(isPascalCase('A')).toBe(true); // single uppercase letter
    expect(isPascalCase('a')).toBe(false); // single lowercase letter
    expect(isPascalCase('1')).toBe(false); // starts with number
  });
});

describe('pascalCaseToTitle', () => {
  it('converts PascalCase to human-readable', () => {
    expect(pascalCaseToTitle('ThunderstormGenerator')).toBe('Thunderstorm Generator');
    expect(pascalCaseToTitle('DreamNode')).toBe('Dream Node');
    expect(pascalCaseToTitle('MyFirstIdea')).toBe('My First Idea');
  });

  it('handles single words', () => {
    expect(pascalCaseToTitle('Thunderstorm')).toBe('Thunderstorm');
    expect(pascalCaseToTitle('Dream')).toBe('Dream');
  });

  it('handles numbers', () => {
    expect(pascalCaseToTitle('Dream20')).toBe('Dream20');
    expect(pascalCaseToTitle('ApiV32')).toBe('Api V32');
  });

  it('handles empty strings', () => {
    expect(pascalCaseToTitle('')).toBe('');
  });

  it('is lossy (cannot perfectly reverse)', () => {
    // Note: This demonstrates the lossy nature of the conversion
    const original = 'Mind-Body Connection';
    const pascalCase = sanitizeTitleToPascalCase(original);
    const recovered = pascalCaseToTitle(pascalCase);
    expect(pascalCase).toBe('MindBodyConnection');
    expect(recovered).toBe('Mind Body Connection'); // Lost the hyphen
    expect(recovered).not.toBe(original);
  });
});

describe('round-trip consistency', () => {
  it('maintains consistency for simple titles', () => {
    const original = 'Thunderstorm Generator';
    const pascalCase = sanitizeTitleToPascalCase(original);
    const recovered = pascalCaseToTitle(pascalCase);
    expect(pascalCase).toBe('ThunderstormGenerator');
    expect(recovered).toBe('Thunderstorm Generator');
  });

  it('shows lossy conversion for complex titles', () => {
    const complexTitles = [
      'Mind-Body Connection',
      'Self-Driving Car',
      'Deep_Neural_Net',
      'API v3.2'
    ];

    complexTitles.forEach(title => {
      const pascalCase = sanitizeTitleToPascalCase(title);
      const recovered = pascalCaseToTitle(pascalCase);
      // Recovered version may not match exactly, but should be readable
      expect(recovered).toBeTruthy();
      expect(recovered.length).toBeGreaterThan(0);
    });
  });
});
