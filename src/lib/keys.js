/** Whether a key press happened in a form field, where Escape belongs to the field, not the page. */
export const isTyping = (target) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
