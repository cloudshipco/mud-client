/**
 * Shared types for settings components
 */

import type { TriggerAction, TriggerCondition, ConditionOperator } from '../../services/triggers-config-store';

export type { TriggerAction, TriggerCondition, ConditionOperator };

export type ActionContext = 'trigger' | 'timer';

export interface CardProps {
  index: number;
  dataPrefix: 'trigger' | 'timer' | 'gauge' | 'group';
  name: string;
  enabled?: boolean;
  showEnabledCheckbox?: boolean;
  showCopyButton?: boolean;
  draggable?: boolean;
  children: string;
  placeholder?: string;
}

export interface SubsectionProps {
  label: string;
  description?: string;
  children: string;
  addButton?: {
    label: string;
    dataAttr: string;
    index: number;
  };
}

export interface ItemListProps {
  children: string;
  className?: string;
}

export interface FormRowProps {
  children: string;
}

export interface ChipProps {
  label: string;
  selected: boolean;
  dataAttr: string;
  value: string;
}

export interface ActionRowProps {
  context: ActionContext;
  parentIndex: number;
  actionIndex: number;
  action: TriggerAction;
  actionTypes: Array<{ value: string; label: string }>;
  triggerOptions?: Array<{ name: string }>;
  timerOptions?: Array<{ name: string }>;
  captureOptions?: string[];
  isFirst?: boolean;
  isLast?: boolean;
}

export interface ActionListProps {
  context: ActionContext;
  parentIndex: number;
  actions: TriggerAction[];
  actionTypes: Array<{ value: string; label: string }>;
  triggerOptions?: Array<{ name: string }>;
  timerOptions?: Array<{ name: string }>;
  captureOptions?: string[];
}

export interface ConditionRowProps {
  triggerIndex: number;
  condIndex: number;
  condition: TriggerCondition;
  captureOptions: string[];
  operators: Array<{ value: ConditionOperator; label: string }>;
}

export interface TextInputProps {
  dataAttr: string;
  value: string;
  placeholder?: string;
  style?: string;
  className?: string;
}

export interface SelectProps {
  dataAttr: string;
  options: Array<{ value: string; label: string; selected?: boolean }>;
  placeholder?: string;
  style?: string;
  className?: string;
}

export interface DeleteButtonProps {
  dataAttr: string;
  index: string;
  title?: string;
}
