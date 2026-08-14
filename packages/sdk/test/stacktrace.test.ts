import { describe, expect, it } from 'vitest'

import { parseStack } from '../src/stacktrace'

describe('parseStack', () => {
  it('reads a V8 stack, innermost frame first', () => {
    const stack = [
      'TypeError: x is not a function',
      '    at doThing (https://app.example/assets/main-a1b2.js:12:34)',
      '    at handler (https://app.example/assets/main-a1b2.js:56:7)',
    ].join('\n')

    const frames = parseStack(stack)
    expect(frames).toHaveLength(2)
    expect(frames[0]).toEqual({
      function: 'doThing',
      filename: 'https://app.example/assets/main-a1b2.js',
      lineno: 12,
      colno: 34,
    })
    expect(frames[1]?.function).toBe('handler')
  })

  it('reads a Firefox/Safari stack', () => {
    const stack = [
      'doThing@https://app.example/main.js:12:34',
      '@https://app.example/main.js:1:1',
    ].join('\n')

    const frames = parseStack(stack)
    expect(frames[0]).toEqual({
      function: 'doThing',
      filename: 'https://app.example/main.js',
      lineno: 12,
      colno: 34,
    })
    // An anonymous frame still carries a location, which is the useful half.
    expect(frames[1]?.filename).toBe('https://app.example/main.js')
    expect(frames[1]?.function).toBeUndefined()
  })

  it('keeps frames that have no location', () => {
    expect(parseStack('Error: nope\n    at <anonymous>')).toEqual([{ filename: '<anonymous>' }])
  })

  // Deep recursion produces stacks with thousands of identical frames; the
  // interesting part is always the top.
  it('caps very deep stacks', () => {
    const stack = ['RangeError: too much', ...Array(500).fill('    at recurse (a.js:1:1)')].join(
      '\n',
    )
    expect(parseStack(stack)).toHaveLength(50)
  })

  it.each([undefined, null, '', 42, {}])('returns [] for %s rather than throwing', (input) => {
    expect(parseStack(input)).toEqual([])
  })
})
