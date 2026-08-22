import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Trash2,
  AlertTriangle,
  SlidersHorizontal,
  Send,
  Coins,
  ShieldCheck,
  RefreshCw,
  X,
} from 'lucide-react';

export interface BatchAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'secondary';
  requireConfirmation?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
  inputs?: Array<{
    id: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'textarea';
    defaultValue?: any;
    options?: Array<{ label: string; value: string | number }>;
    placeholder?: string;
    required?: boolean;
  }>;
  onExecute: (selectedIds: string[], formValues?: Record<string, any>) => Promise<void>;
}

interface BatchActionBarProps {
  selectedIds?: string[];
  selectedCount: number;
  totalVisibleCount: number;
  totalFilteredCount: number;
  isAllVisibleSelected: boolean;
  onSelectAllFiltered?: () => void;
  onClearSelection: () => void;
  actions: BatchAction[];
  isExecuting?: boolean;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedIds = [],
  selectedCount,
  totalVisibleCount,
  totalFilteredCount,
  isAllVisibleSelected,
  onSelectAllFiltered,
  onClearSelection,
  actions,
  isExecuting = false,
}) => {
  const [activeModalAction, setActiveModalAction] = useState<BatchAction | null>(null);
  const [formState, setFormState] = useState<Record<string, any>>({});
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [inProgress, setInProgress] = useState<boolean>(false);

  if (selectedCount === 0) return null;

  const handleActionClick = (action: BatchAction) => {
    if (action.requireConfirmation || (action.inputs && action.inputs.length > 0)) {
      const initialValues: Record<string, any> = {};
      action.inputs?.forEach((inp) => {
        initialValues[inp.id] = inp.defaultValue !== undefined ? inp.defaultValue : '';
      });
      setFormState(initialValues);
      setErrorMessage('');
      setActiveModalAction(action);
    } else {
      executeAction(action, {});
    }
  };

  const executeAction = async (action: BatchAction, values: Record<string, any>) => {
    setInProgress(true);
    setErrorMessage('');
    try {
      await action.onExecute(selectedIds, values);
      setActiveModalAction(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Operation failed');
    } finally {
      setInProgress(false);
    }
  };

  const getVariantStyles = (variant: BatchAction['variant'] = 'secondary') => {
    switch (variant) {
      case 'primary':
        return 'bg-amber-500 hover:bg-amber-400 text-slate-950';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-500 text-white';
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-500 text-white';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-500 text-white';
      case 'secondary':
      default:
        return 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700';
    }
  };

  return (
    <>
      <div className="bg-slate-950/90 backdrop-blur border border-amber-500/40 rounded-2xl p-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xl animate-fade-in">
        {/* Left: Info */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="font-extrabold text-xs text-white">
              {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
            </span>
          </div>

          {selectedCount < totalFilteredCount && onSelectAllFiltered && (
            <button
              onClick={onSelectAllFiltered}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
            >
              Select all {totalFilteredCount} matching records
            </button>
          )}

          <button
            onClick={onClearSelection}
            className="text-[11px] font-bold text-slate-400 hover:text-white px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800"
          >
            Deselect All
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {actions.map((act) => (
            <button
              key={act.id}
              onClick={() => handleActionClick(act)}
              disabled={isExecuting || inProgress}
              className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer shadow ${getVariantStyles(
                act.variant
              )}`}
            >
              {act.icon}
              <span>{act.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Confirmation & Form Modal */}
      {activeModalAction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                {activeModalAction.variant === 'danger' ? (
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                ) : (
                  <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                )}
                <span>{activeModalAction.confirmTitle || activeModalAction.label}</span>
              </h3>
              <button
                onClick={() => setActiveModalAction(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              {activeModalAction.confirmMessage ||
                `Apply "${activeModalAction.label}" to ${selectedCount} selected record(s)?`}
            </p>

            {/* Inputs if defined */}
            {activeModalAction.inputs && activeModalAction.inputs.length > 0 && (
              <div className="space-y-3 pt-2">
                {activeModalAction.inputs.map((inp) => (
                  <div key={inp.id} className="text-xs">
                    <label className="text-slate-400 font-bold block mb-1">
                      {inp.label}
                      {inp.required && <span className="text-rose-400 ml-1">*</span>}
                    </label>
                    {inp.type === 'select' ? (
                      <select
                        value={formState[inp.id] ?? ''}
                        onChange={(e) =>
                          setFormState((prev) => ({ ...prev, [inp.id]: e.target.value }))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      >
                        {inp.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : inp.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={formState[inp.id] ?? ''}
                        onChange={(e) =>
                          setFormState((prev) => ({ ...prev, [inp.id]: e.target.value }))
                        }
                        placeholder={inp.placeholder}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    ) : (
                      <input
                        type={inp.type}
                        value={formState[inp.id] ?? ''}
                        onChange={(e) =>
                          setFormState((prev) => ({
                            ...prev,
                            [inp.id]: inp.type === 'number' ? Number(e.target.value) : e.target.value,
                          }))
                        }
                        placeholder={inp.placeholder}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {errorMessage && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-3">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveModalAction(null)}
                disabled={inProgress}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeAction(activeModalAction, formState)}
                disabled={inProgress}
                className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${getVariantStyles(
                  activeModalAction.variant
                )}`}
              >
                {inProgress ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Confirm & Execute</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
