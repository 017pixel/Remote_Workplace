export function elementContainsEventTarget(
  element: Element | null | undefined,
  target: EventTarget | null,
): boolean {
  if (!element || !target) return false;
  const NodeConstructor = element.ownerDocument.defaultView?.Node;
  return Boolean(NodeConstructor && target instanceof NodeConstructor && element.contains(target));
}
