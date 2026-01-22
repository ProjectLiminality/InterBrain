import React, { useState, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker - use bundled worker for Electron/Obsidian compatibility
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PDFPreviewProps {
  /** PDF data URL (base64) or URL to PDF file */
  src: string;
  /** Width of the preview in pixels */
  width?: number;
  /** Height constraint for the preview */
  height?: number;
  /** Whether to show only the first page (thumbnail mode) */
  thumbnailMode?: boolean;
  /** Custom styles for the container */
  style?: React.CSSProperties;
  /** Callback when loading fails */
  onError?: (error: Error) => void;
}

/**
 * PDFPreview component renders the first page of a PDF as a visual preview.
 * Uses react-pdf (which wraps PDF.js) for proper PDF rendering.
 */
export const PDFPreview: React.FC<PDFPreviewProps> = ({
  src,
  width = 150,
  height,
  thumbnailMode = true,
  style,
  onError
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset state when src changes
  useEffect(() => {
    setError(null);
    setLoading(true);
    setNumPages(null);
  }, [src]);

  const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const handleLoadError = (err: Error) => {
    console.error('[PDFPreview] Failed to load PDF:', err);
    console.error('[PDFPreview] PDF source (first 100 chars):', src?.substring(0, 100));
    setError(err);
    setLoading(false);
    onError?.(err);
  };

  // State for fetched PDF data (for app:// URLs that pdfjs can't load directly)
  const [fetchedData, setFetchedData] = useState<Uint8Array | null>(null);
  const [fetchError, setFetchError] = useState<boolean>(false);

  // Fetch PDF data for app:// URLs (Obsidian's getResourcePath format)
  useEffect(() => {
    if (!src) {
      console.log('[PDFPreview] No src provided');
      return;
    }

    console.log('[PDFPreview] src:', src.substring(0, 100));

    // app:// URLs need to be fetched as ArrayBuffer since pdfjs can't load them directly
    if (src.startsWith('app://')) {
      console.log('[PDFPreview] Fetching app:// URL...');
      setFetchedData(null);
      setFetchError(false);

      fetch(src)
        .then(response => {
          console.log('[PDFPreview] Fetch response:', response.status, response.statusText);
          return response.arrayBuffer();
        })
        .then(buffer => {
          console.log('[PDFPreview] Fetched PDF, size:', buffer.byteLength);
          setFetchedData(new Uint8Array(buffer));
        })
        .catch(err => {
          console.error('[PDFPreview] Failed to fetch PDF:', err);
          setFetchError(true);
        });
    }
  }, [src]);

  // Convert data URL to object for react-pdf
  // react-pdf can have issues with very long data URLs, so we convert to Uint8Array
  const fileData = useMemo(() => {
    if (!src) return null;

    // If we fetched data for app:// URL, use that
    if (src.startsWith('app://')) {
      return fetchedData ? { data: fetchedData } : null;
    }

    // If it's a data URL, extract the base64 and convert to Uint8Array
    if (src.startsWith('data:')) {
      try {
        const base64Match = src.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          const base64 = base64Match[1];
          const binaryString = globalThis.atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return { data: bytes };
        }
      } catch (e) {
        console.error('[PDFPreview] Failed to parse data URL:', e);
      }
    }

    // Otherwise return as-is (could be a regular URL)
    return src;
  }, [src, fetchedData]);

  const containerStyle: React.CSSProperties = {
    width: style?.width || width,
    height: style?.height || height || 'auto',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: style?.borderRadius || '4px',
    ...style
  };

  if (error || fetchError) {
    return (
      <div style={{
        ...containerStyle,
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '10px',
        textAlign: 'center',
        padding: '8px'
      }}>
        <div>
          <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>📄</span>
          PDF
        </div>
      </div>
    );
  }

  // Loading indicator component
  const loadingIndicator = (
    <div style={{
      ...containerStyle,
      position: 'absolute',
      color: 'rgba(255, 255, 255, 0.4)',
      fontSize: '10px'
    }}>
      Loading...
    </div>
  );

  if (!fileData) {
    // Show loading indicator while fetching app:// URLs
    const isFetching = src?.startsWith('app://') && !fetchedData && !fetchError;
    return (
      <div style={{
        ...containerStyle,
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '10px',
        textAlign: 'center',
        padding: '8px'
      }}>
        <div>
          <span style={{ fontSize: '20px', display: 'block', marginBottom: '4px' }}>📄</span>
          {isFetching ? 'Loading...' : 'No PDF'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, position: 'relative' }}>
      {loading && loadingIndicator}
      <Document
        file={fileData}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        loading={null}
      >
        {thumbnailMode ? (
          <Page
            pageNumber={1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ) : (
          // Full mode: render all pages
          Array.from(new Array(numPages || 0), (_, index) => (
            <Page
              key={`page_${index + 1}`}
              pageNumber={index + 1}
              width={width}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          ))
        )}
      </Document>
    </div>
  );
};

export default PDFPreview;
