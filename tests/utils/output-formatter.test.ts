import { describe, it, expect } from 'vitest';
import {
  formatBorder,
  formatSeparator,
  formatSectionHeader,
  formatSection,
  formatKeyValue,
  formatKeyValueList,
  formatTable,
  formatList,
  formatStatus,
  formatProgress,
  formatOutputBlock,
} from '../../src/utils/output-formatter.js';

describe('formatBorder', () => {
  it('should create light border of default width', () => {
    const result = formatBorder();
    expect(result).toBe('─'.repeat(75));
    expect(result.length).toBe(75);
  });

  it('should create light border of specified width', () => {
    const result = formatBorder(10, 'light');
    expect(result).toBe('──────────');
    expect(result.length).toBe(10);
  });

  it('should create heavy border', () => {
    const result = formatBorder(10, 'heavy');
    expect(result).toBe('══════════');
    expect(result.length).toBe(10);
  });

  it('should create empty border with none style', () => {
    const result = formatBorder(10, 'none');
    expect(result).toBe('');
  });
});

describe('formatSeparator', () => {
  it('should create separator without label', () => {
    const result = formatSeparator(undefined, 20);
    expect(result).toBe('─'.repeat(20));
  });

  it('should create separator with centered label', () => {
    const result = formatSeparator('TEST', 20);
    expect(result).toContain('TEST');
    // Length might differ slightly due to spacing around label
    expect(result.length).toBeGreaterThanOrEqual(18);
    expect(result.length).toBeLessThanOrEqual(22);
    // Should have borders on both sides of label
    expect(result).toMatch(/^─+ TEST ─+$/);
  });

  it('should handle long labels gracefully', () => {
    const result = formatSeparator('VERY LONG LABEL TEXT', 20);
    expect(result).toContain('VERY LONG LABEL TEXT');
  });
});

describe('formatSectionHeader', () => {
  it('should format section header without indent', () => {
    const result = formatSectionHeader('NODE');
    expect(result).toBe('[NODE]');
  });

  it('should format section header with indent level 1', () => {
    const result = formatSectionHeader('DATABASE', 1);
    expect(result).toBe('  [DATABASE]');
  });

  it('should format section header with indent level 2', () => {
    const result = formatSectionHeader('CONFIG', 2);
    expect(result).toBe('    [CONFIG]');
  });

  it('should handle empty title', () => {
    const result = formatSectionHeader('');
    expect(result).toBe('[]');
  });
});

describe('formatSection', () => {
  it('should format section with header and content', () => {
    const result = formatSection('TEST', ['Line 1', 'Line 2']);
    expect(result).toEqual([
      '[TEST]',
      'Line 1',
      'Line 2',
      '',
    ]);
  });

  it('should format section without spacing', () => {
    const result = formatSection('TEST', ['Line 1'], { addSpacing: false });
    expect(result).toEqual([
      '[TEST]',
      'Line 1',
    ]);
    expect(result[result.length - 1]).not.toBe('');
  });

  it('should format section with indent', () => {
    const result = formatSection('TEST', ['Line 1'], { indent: 1 });
    expect(result[0]).toBe('  [TEST]');
  });

  it('should handle empty content', () => {
    const result = formatSection('TEST', []);
    expect(result).toEqual(['[TEST]', '']);
  });
});

describe('formatKeyValue', () => {
  it('should format key-value with default settings', () => {
    const result = formatKeyValue('Uptime', '49s');
    expect(result).toMatch(/^\s{2}\w+\s*=\s*49s$/);
    expect(result).toContain('Uptime');
    expect(result).toContain('49s');
  });

  it('should format key-value with custom key width', () => {
    const result = formatKeyValue('Key', 'Value', { keyWidth: 10 });
    expect(result).toContain('Key');
    expect(result).toContain('Value');
  });

  it('should format key-value with custom separator', () => {
    const result = formatKeyValue('Key', 'Value', { separator: ' = ' });
    expect(result).toContain('=');
    expect(result).toContain('Key');
    expect(result).toContain('Value');
  });

  it('should format key-value with custom indent', () => {
    const result = formatKeyValue('Key', 'Value', { indent: 2 });
    expect(result.startsWith('    ')).toBe(true);
  });

  it('should handle null value', () => {
    const result = formatKeyValue('Key', null);
    expect(result).toContain('n/a');
  });

  it('should handle undefined value', () => {
    const result = formatKeyValue('Key', undefined);
    expect(result).toContain('n/a');
  });

  it('should handle number value', () => {
    const result = formatKeyValue('Count', 42);
    expect(result).toContain('42');
  });

  it('should handle boolean value', () => {
    const result = formatKeyValue('Enabled', true);
    expect(result).toContain('true');
  });
});

describe('formatKeyValueList', () => {
  it('should format multiple key-value pairs with alignment', () => {
    const result = formatKeyValueList([
      ['Uptime', '49s'],
      ['Memory', '188 MB'],
      ['PID', '73'],
    ]);
    
    expect(result).toHaveLength(3);
    expect(result[0]).toContain('Uptime');
    expect(result[1]).toContain('Memory');
    expect(result[2]).toContain('PID');
  });

  it('should align keys to longest key width', () => {
    const result = formatKeyValueList([
      ['Short', 'A'],
      ['Very Long Key', 'B'],
      ['Mid', 'C'],
    ]);
    
    // All keys should be padded to same width
    const keyEnds = result.map(line => line.indexOf('='));
    expect(keyEnds[0]).toBe(keyEnds[1]);
    expect(keyEnds[1]).toBe(keyEnds[2]);
  });

  it('should handle empty list', () => {
    const result = formatKeyValueList([]);
    expect(result).toEqual([]);
  });

  it('should handle custom separator', () => {
    const result = formatKeyValueList([['Key', 'Value']], { separator: ' : ' });
    expect(result[0]).toContain(':');
  });

  it('should handle custom indent', () => {
    const result = formatKeyValueList([['Key', 'Value']], { indent: 2 });
    expect(result[0].startsWith('    ')).toBe(true);
  });

  it('should handle various value types', () => {
    const result = formatKeyValueList([
      ['String', 'text'],
      ['Number', 42],
      ['Boolean', true],
      ['Null', null],
      ['Undefined', undefined],
    ]);
    
    expect(result[0]).toContain('text');
    expect(result[1]).toContain('42');
    expect(result[2]).toContain('true');
    expect(result[3]).toContain('n/a');
    expect(result[4]).toContain('n/a');
  });
});

describe('formatTable', () => {
  it('should format table with headers and rows', () => {
    const headers = ['Name', 'Type', 'Count'];
    const rows = [
      ['Species', 'table', '1025'],
      ['Move', 'table', '918'],
    ];
    
    const result = formatTable(headers, rows);
    
    expect(result).toHaveLength(4); // Header + separator + 2 rows
    expect(result[0]).toContain('Name');
    expect(result[0]).toContain('Type');
    expect(result[0]).toContain('Count');
    expect(result[1]).toContain('─'); // Separator line
    expect(result[2]).toContain('Species');
    expect(result[3]).toContain('Move');
  });

  it('should align columns consistently', () => {
    const headers = ['Short', 'Very Long Header', 'Mid'];
    const rows = [
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
    ];
    
    const result = formatTable(headers, rows);
    
    // Each row should have same length
    expect(result[2].length).toBe(result[3].length);
  });

  it('should handle custom column widths', () => {
    const headers = ['A', 'B'];
    const rows = [['1', '2']];
    
    const result = formatTable(headers, rows, { columnWidths: [10, 15] });
    
    expect(result[0].length).toBeGreaterThanOrEqual(25); // 10 + 15 + separator
  });

  it('should handle custom indent', () => {
    const headers = ['A'];
    const rows = [['1']];
    
    const result = formatTable(headers, rows, { indent: 2 });
    
    expect(result[0].startsWith('    ')).toBe(true);
  });

  it('should handle null values in cells', () => {
    const headers = ['Name', 'Value'];
    const rows = [
      ['Key1', null],
      ['Key2', '123'],
    ];
    
    const result = formatTable(headers, rows);
    
    expect(result[2]).toContain('Key1');
    expect(result[3]).toContain('Key2');
  });

  it('should handle empty rows', () => {
    const headers = ['A', 'B'];
    const rows: Array<Array<string | number | null>> = [];
    
    const result = formatTable(headers, rows);
    
    expect(result).toHaveLength(2); // Header + separator only
  });
});

describe('formatList', () => {
  it('should format bulleted list', () => {
    const result = formatList(['Item 1', 'Item 2', 'Item 3']);
    
    expect(result).toHaveLength(3);
    expect(result[0]).toContain('•');
    expect(result[1]).toContain('•');
    expect(result[2]).toContain('•');
  });

  it('should format numbered list', () => {
    const result = formatList(['First', 'Second', 'Third'], { numbered: true });
    
    expect(result[0]).toContain('1.');
    expect(result[1]).toContain('2.');
    expect(result[2]).toContain('3.');
  });

  it('should handle custom bullet', () => {
    const result = formatList(['Item'], { bullet: '-' });
    
    expect(result[0]).toContain('-');
    expect(result[0]).not.toContain('•');
  });

  it('should handle custom indent', () => {
    const result = formatList(['Item'], { indent: 2 });
    
    expect(result[0].startsWith('    ')).toBe(true);
  });

  it('should handle empty list', () => {
    const result = formatList([]);
    
    expect(result).toEqual([]);
  });
});

describe('formatStatus', () => {
  it('should format success status', () => {
    const result = formatStatus('Operation completed', 'success');
    
    expect(result).toContain('✅');
    expect(result).toContain('Operation completed');
  });

  it('should format warning status', () => {
    const result = formatStatus('Cache nearly full', 'warning');
    
    expect(result).toContain('⚠️');
    expect(result).toContain('Cache nearly full');
  });

  it('should format error status', () => {
    const result = formatStatus('Connection failed', 'error');
    
    expect(result).toContain('❌');
    expect(result).toContain('Connection failed');
  });

  it('should format info status', () => {
    const result = formatStatus('Starting process', 'info');
    
    expect(result).toContain('ℹ️');
    expect(result).toContain('Starting process');
  });

  it('should handle custom indent', () => {
    const result = formatStatus('Message', 'info', 2);
    
    expect(result.startsWith('    ')).toBe(true);
  });
});

describe('formatProgress', () => {
  it('should format progress with percentage', () => {
    const result = formatProgress('Processing', 25, 100);
    
    expect(result).toContain('Processing');
    expect(result).toContain('[25/100]');
    expect(result).toContain('(25%)');
  });

  it('should calculate percentage correctly', () => {
    const result = formatProgress('Syncing', 843, 1025);
    
    expect(result).toContain('[843/1025]');
    expect(result).toContain('(82%)'); // Rounded
  });

  it('should handle zero progress', () => {
    const result = formatProgress('Starting', 0, 100);
    
    expect(result).toContain('[0/100]');
    expect(result).toContain('(0%)');
  });

  it('should handle complete progress', () => {
    const result = formatProgress('Done', 100, 100);
    
    expect(result).toContain('[100/100]');
    expect(result).toContain('(100%)');
  });

  it('should handle custom indent', () => {
    const result = formatProgress('Task', 1, 10, 2);
    
    expect(result.startsWith('    ')).toBe(true);
  });
});

describe('formatOutputBlock', () => {
  it('should format block with single section', () => {
    const result = formatOutputBlock({
      sections: [
        {
          header: 'TEST',
          content: ['Line 1', 'Line 2'],
          type: 'lines',
        },
      ],
      borders: true,
    });
    
    expect(result).toContain('[TEST]');
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
    expect(result).toContain('─'); // Border
  });

  it('should format block with multiple sections', () => {
    const result = formatOutputBlock({
      sections: [
        {
          header: 'SECTION 1',
          content: ['A'],
          type: 'lines',
        },
        {
          header: 'SECTION 2',
          content: ['B'],
          type: 'lines',
        },
      ],
      borders: true,
    });
    
    expect(result).toContain('[SECTION 1]');
    expect(result).toContain('[SECTION 2]');
  });

  it('should format block with key-value section', () => {
    const result = formatOutputBlock({
      sections: [
        {
          header: 'CONFIG',
          content: [
            ['Key1', 'Value1'],
            ['Key2', 'Value2'],
          ],
          type: 'keyvalue',
        },
      ],
      borders: true,
    });
    
    expect(result).toContain('[CONFIG]');
    expect(result).toContain('Key1');
    expect(result).toContain('Value1');
  });

  it('should format block without borders', () => {
    const result = formatOutputBlock({
      sections: [
        {
          header: 'TEST',
          content: ['Content'],
          type: 'lines',
        },
      ],
      borders: false,
    });
    
    expect(result).not.toContain('─');
    expect(result).toContain('[TEST]');
  });

  it('should handle title in output block', () => {
    const result = formatOutputBlock({
      title: 'MAIN TITLE',
      sections: [
        {
          header: 'SECTION',
          content: ['Line'],
          type: 'lines',
        },
      ],
      borders: true,
    });
    
    // Title should appear near borders
    expect(result).toContain('─');
    expect(result).toContain('[SECTION]');
  });
});

describe('Output Formatter Integration', () => {
  it('should produce consistent output for database status', () => {
    const sections = [
      {
        header: 'NODE',
        content: formatKeyValueList([
          ['Uptime', '49s'],
          ['Memory', '188 MB'],
        ]),
        type: 'lines' as const,
      },
      {
        header: 'DATABASE',
        content: formatKeyValueList([
          ['Status', 'HEALTHY'],
          ['Latency', '2.72ms'],
        ]),
        type: 'lines' as const,
      },
    ];
    
    const output = formatOutputBlock({
      sections,
      borders: true,
    });
    
    expect(output).toContain('[NODE]');
    expect(output).toContain('[DATABASE]');
    expect(output).toContain('Uptime');
    expect(output).toContain('Status');
    expect(output).toContain('─'); // Border
  });

  it('should produce consistent output for CLI status', () => {
    const output = [
      formatBorder(75),
      formatSectionHeader('DATABASE STATUS'),
      ...formatKeyValueList([
        ['Tables', '42'],
        ['Size', '156 MB'],
        ['Last Sync', '2 mins ago'],
      ]),
      '',
      formatBorder(75),
    ].join('\n');
    
    expect(output).toContain('─');
    expect(output).toContain('[DATABASE STATUS]');
    expect(output).toContain('Tables');
    expect(output).toContain('42');
  });
});

describe('Edge Cases', () => {
  it('should handle very long strings gracefully', () => {
    const longString = 'A'.repeat(200);
    const result = formatKeyValue('Key', longString);
    
    expect(result).toContain('Key');
    expect(result).toContain(longString);
  });

  it('should handle special characters in values', () => {
    const result = formatKeyValue('Path', 'C:\\Users\\test\\file.txt');
    
    expect(result).toContain('C:\\Users\\test\\file.txt');
  });

  it('should handle unicode characters', () => {
    const result = formatStatus('成功', 'success');
    
    expect(result).toContain('✅');
    expect(result).toContain('成功');
  });

  it('should handle empty strings', () => {
    const result = formatKeyValue('Key', '');
    
    expect(result).toContain('Key');
  });
});
