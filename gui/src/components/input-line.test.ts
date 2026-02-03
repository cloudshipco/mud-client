import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InputLine } from './input-line';

describe('InputLine', () => {
  let container: HTMLElement;
  let inputLine: InputLine;
  let onInputMock: ReturnType<typeof vi.fn>;
  let sentData: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    sentData = [];
    onInputMock = vi.fn((data: string) => {
      sentData.push(data);
    });
    inputLine = new InputLine(container, {
      onInput: onInputMock,
      inputMode: 'select',
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  function getTextarea(): HTMLTextAreaElement {
    return container.querySelector('textarea')!;
  }

  function pressKey(key: string, options: Partial<KeyboardEventInit> = {}) {
    const textarea = getTextarea();
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    textarea.dispatchEvent(event);
    return event;
  }

  function triggerInputEvent() {
    const textarea = getTextarea();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  describe('history navigation and backspace', () => {
    it('should not delete entire input when pressing backspace after history navigation', () => {
      const textarea = getTextarea();

      // Simulate: user typed "hello" and pressed Enter
      textarea.value = 'hello';
      pressKey('Enter');

      // Clear sent data to focus on what happens next
      sentData.length = 0;

      // Simulate: user presses Up to get history
      pressKey('ArrowUp');

      // Verify Up arrow sent escape sequence
      expect(sentData).toContain('\x1b[A');

      // Simulate: backend responds with history text "previous command"
      inputLine.setText('previous command');
      inputLine.setCursor(16); // cursor at end

      // Verify text was set
      expect(textarea.value).toBe('previous command');

      // Clear sent data again
      sentData.length = 0;

      // Simulate: user presses Backspace
      // First, manually delete one char (simulating browser default behavior)
      textarea.value = 'previous comman'; // one char deleted
      textarea.setSelectionRange(15, 15);

      // Then trigger the input event (which fires after value changes)
      triggerInputEvent();

      // The bug was: Ctrl+U was sent to backend, which responded with empty text
      // and cleared the entire input. The fix is to NOT send Ctrl+U.
      expect(sentData).not.toContain('\x15');

      // Verify the text is still there (minus one character)
      expect(textarea.value).toBe('previous comman');
    });

    it('should properly sync with backend on Enter after editing history', () => {
      const textarea = getTextarea();

      // User presses Up to get history
      pressKey('ArrowUp');

      // Backend responds with history
      inputLine.setText('old command');
      inputLine.setCursor(11);

      // User edits (simulated by changing value and triggering input)
      textarea.value = 'old comman'; // deleted 'd'
      textarea.setSelectionRange(10, 10);
      triggerInputEvent();

      // Clear sent data
      sentData.length = 0;

      // User presses Enter
      pressKey('Enter');

      // Should send Ctrl+U + full text + Enter (to sync backend)
      // Because backendHasText is false after editing
      expect(sentData.length).toBe(1);
      expect(sentData[0]).toBe('\x15old comman\r');
    });

    it('should not send Ctrl+U when backend already has correct text', () => {
      const textarea = getTextarea();

      // User presses Up to get history
      pressKey('ArrowUp');

      // Backend responds with history
      inputLine.setText('old command');
      inputLine.setCursor(11);

      // Clear sent data
      sentData.length = 0;

      // User presses Enter WITHOUT editing
      pressKey('Enter');

      // Should just send Enter (backend already has the text)
      expect(sentData.length).toBe(1);
      expect(sentData[0]).toBe('\r');
    });

    it('should cancel pending select timeout when navigating history', async () => {
      const textarea = getTextarea();

      // Type and send command
      textarea.value = 'test';
      pressKey('Enter');

      // Wait less than 20ms and press Up
      await new Promise(resolve => setTimeout(resolve, 5));
      pressKey('ArrowUp');

      // Backend responds
      inputLine.setText('history item');
      inputLine.setCursor(12);

      // Wait for the original 20ms timeout to potentially fire
      await new Promise(resolve => setTimeout(resolve, 30));

      // Check that text is NOT selected (the timeout was cancelled)
      expect(textarea.selectionStart).toBe(textarea.selectionEnd);
    });

    it('should collapse selection when pressing Up with text selected', () => {
      const textarea = getTextarea();

      // Set up selected text (simulating state after Enter in select mode)
      textarea.value = 'selected text';
      textarea.select(); // Select all

      // Verify text is selected
      expect(textarea.selectionStart).toBe(0);
      expect(textarea.selectionEnd).toBe(13);

      // Press Up for history
      pressKey('ArrowUp');

      // Selection should be collapsed (cursor at end)
      expect(textarea.selectionStart).toBe(textarea.selectionEnd);
    });
  });
});
