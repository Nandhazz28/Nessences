import { useAsync } from "../../hooks/useAsync.js";
import { contentApi } from "../../services/engage.js";
import { Modal } from "../common/Modal.jsx";
import { RichText } from "../common/RichText.jsx";

export function SizeGuide({ onClose }) {
  const { data, error, loading } = useAsync(
    (s) => contentApi.page("size-guide", s),
    [],
  );
  return (
    <Modal title="Size guide" onClose={onClose} wide>
      {loading && (
        <p role="status" className="eyebrow">
          Loading…
        </p>
      )}
      {error && (
        <p role="alert" className="text-oxblood">
          {error.status === 404
            ? "The size guide has not been published yet."
            : error.message}
        </p>
      )}
      {data && <RichText text={data.body} />}
    </Modal>
  );
}
