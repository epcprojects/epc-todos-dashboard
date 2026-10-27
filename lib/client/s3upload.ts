/** Sends one file straight to S3 with a presigned POST form, reporting progress (0..1). */
export function uploadToS3(url: string, fields: Record<string, string>, file: File, onProgress: (p: number) => void): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', file); // must be the last field
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      const m = /<Message>([^<]*)<\/Message>/.exec(xhr.responseText || '');
      reject(new Error(m ? m[1] : `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload blocked. If this keeps happening, the bucket CORS rule is missing (see README: S3 setup).'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
