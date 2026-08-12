import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "../icons";

export interface TreeNode {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  children?: TreeNode[];
  expanded?: boolean;
  selected?: boolean;
}

export function Tree({ nodes, label, onSelect, onToggle }: { nodes: TreeNode[]; label: string; onSelect?: (node: TreeNode) => void; onToggle?: (node: TreeNode) => void }) {
  return <div className="ui-tree" role="tree" aria-label={label}>{nodes.map((node) => <TreeRow key={node.id} node={node} level={1} {...(onSelect ? { onSelect } : {})} {...(onToggle ? { onToggle } : {})} />)}</div>;
}

function TreeRow({ node, level, onSelect, onToggle }: { node: TreeNode; level: number; onSelect?: (node: TreeNode) => void; onToggle?: (node: TreeNode) => void }) {
  const hasChildren = Boolean(node.children?.length);
  return <div role="none"><button type="button" role="treeitem" aria-level={level} aria-selected={node.selected} aria-expanded={hasChildren ? node.expanded : undefined} className="ui-tree-row" style={{ "--tree-level": level } as React.CSSProperties} onClick={() => onSelect?.(node)} onKeyDown={(event) => { if (!hasChildren) return; if (event.key === "ArrowRight" && !node.expanded) { event.preventDefault(); onToggle?.(node); } if (event.key === "ArrowLeft" && node.expanded) { event.preventDefault(); onToggle?.(node); } }}><span className="ui-tree-toggle" onClick={(event) => { if (!hasChildren) return; event.stopPropagation(); onToggle?.(node); }}>{hasChildren ? node.expanded ? <ChevronDownIcon aria-hidden /> : <ChevronRightIcon aria-hidden /> : null}</span>{node.icon ? <span aria-hidden>{node.icon}</span> : null}<span>{node.label}</span></button>{hasChildren && node.expanded ? <div role="group">{node.children!.map((child) => <TreeRow key={child.id} node={child} level={level + 1} {...(onSelect ? { onSelect } : {})} {...(onToggle ? { onToggle } : {})} />)}</div> : null}</div>;
}
