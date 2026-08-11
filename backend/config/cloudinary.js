import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import { Readable } from 'stream';

if (fs.existsSync('./backend/.env')) {
  dotenv.config({ path: './backend/.env' });
} else {
  dotenv.config();
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'swastha-reports',
    resource_type: 'auto',
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    use_filename: true,
    unique_filename: false,
  },
});

const uploadReportFile = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function uploadImageToCloudinary(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.buffer) {
      return reject(new Error('Image file buffer is required for Cloudinary upload.'));
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'swastha-reports',
        resource_type: 'auto',
        use_filename: true,
        unique_filename: false,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result?.secure_url || result?.url || null);
      }
    );

    const readable = new Readable();
    readable._read = () => {}; // noop
    readable.push(file.buffer);
    readable.push(null);
    readable.pipe(stream);
  });
}

export { uploadReportFile, cloudinary };
