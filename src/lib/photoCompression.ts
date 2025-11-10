import imageCompression from 'browser-image-compression';

// Validation constants
const MAX_INPUT_SIZE_MB = 10;
const MAX_INPUT_SIZE_BYTES = MAX_INPUT_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Compression settings
const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/webp',
  initialQuality: 0.85,
  preserveExif: false,
};

export interface PhotoValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a photo file before compression
 * @param file - The file to validate
 * @returns Validation result with error message if invalid
 */
export function validatePhotoFile(file: File): PhotoValidationResult {
  // Check if file exists
  if (!file) {
    return {
      isValid: false,
      error: 'No file provided',
    };
  }

  // Check file size
  if (file.size > MAX_INPUT_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds ${MAX_INPUT_SIZE_MB}MB limit. Current size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
    };
  }

  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: `Invalid file type: ${file.type}. Allowed types: JPG, PNG, WebP`,
    };
  }

  return { isValid: true };
}

/**
 * Compresses a single photo file
 * @param file - The file to compress
 * @returns Promise resolving to compressed Blob
 * @throws Error if validation fails or compression fails
 */
export async function compressPhoto(file: File): Promise<Blob> {
  // Validate file
  const validation = validatePhotoFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  console.log('Starting compression for:', file.name);
  console.log('Original size:', (file.size / 1024).toFixed(2), 'KB');

  try {
    const compressedFile = await imageCompression(file, COMPRESSION_OPTIONS);

    console.log('Compression complete for:', file.name);
    console.log('Compressed size:', (compressedFile.size / 1024).toFixed(2), 'KB');
    console.log('Compression ratio:', ((1 - compressedFile.size / file.size) * 100).toFixed(1), '% reduction');

    return compressedFile;
  } catch (error) {
    console.error('Compression failed for:', file.name, error);
    throw new Error(`Failed to compress ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Compresses multiple photo files with progress tracking
 * @param files - Array of files to compress
 * @param onProgress - Optional callback for progress updates (current index, total count)
 * @returns Promise resolving to array of compressed Blobs
 */
export async function compressPhotos(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<Blob[]> {
  if (!files || files.length === 0) {
    throw new Error('No files provided for compression');
  }

  console.log(`Starting batch compression of ${files.length} file(s)`);

  const compressedBlobs: Blob[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const compressed = await compressPhoto(files[i]);
      compressedBlobs.push(compressed);
      
      if (onProgress) {
        onProgress(i + 1, files.length);
      }
    } catch (error) {
      const errorMsg = `Failed to compress ${files[i].name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  console.log(`Batch compression complete: ${compressedBlobs.length}/${files.length} files compressed successfully`);

  if (errors.length > 0 && compressedBlobs.length === 0) {
    throw new Error(`All files failed to compress:\n${errors.join('\n')}`);
  }

  if (errors.length > 0) {
    console.warn(`Some files failed to compress:\n${errors.join('\n')}`);
  }

  return compressedBlobs;
}
