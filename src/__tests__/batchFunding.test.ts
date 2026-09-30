import { describe, it, expect } from 'vitest';
import { splitCsvLine } from '../lib/batchFunding';

describe('splitCsvLine', () => {
  it('splits simple unquoted fields', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('preserves empty fields', () => {
    expect(splitCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('strips quotes from whole-field-wrapped values', () => {
    expect(splitCsvLine('"a","b"')).toEqual(['a', 'b']);
  });

  it('does not split on commas inside quoted fields', () => {
    expect(splitCsvLine('"CABC123,note",10')).toEqual(['CABC123,note', '10']);
  });

  it('handles multiple quoted fields containing commas', () => {
    expect(splitCsvLine('"a,b","c,d",e')).toEqual(['a,b', 'c,d', 'e']);
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    expect(splitCsvLine('"say ""hi""",1')).toEqual(['say "hi"', '1']);
  });

  it('handles escaped quotes alongside quoted commas', () => {
    expect(splitCsvLine('"a,""b""",2')).toEqual(['a,"b"', '2']);
  });

  it('keeps unquoted fields containing quotes intact', () => {
    expect(splitCsvLine('a"b,c')).toEqual(['a"b', 'c']);
  });
});
