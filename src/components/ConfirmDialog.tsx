interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-msg">{message}</p>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onCancel}>
            取消
          </button>
          <button className="btn danger" onClick={onConfirm}>
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
