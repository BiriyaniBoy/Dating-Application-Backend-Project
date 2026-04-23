import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    // Configuration
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Upload the file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    // File has been uploaded successfully
    if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
    }
    return response;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error.message);
    if (localFilePath && fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath); 
    }
    return null;
  }
};

const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl) return null;

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Extract the public_id from the full Cloudinary URL
    // URL format: https://res.cloudinary.com/<cloud>/image/upload/v<version>/<public_id>.<ext>
    const urlParts = imageUrl.split("/");
    const fileWithExt = urlParts[urlParts.length - 1];          // e.g. "abc123.jpg"
    const publicId = fileWithExt.split(".")[0];                 // e.g. "abc123"

    const response = await cloudinary.uploader.destroy(publicId);
    return response; // { result: 'ok' } on success
  } catch (error) {
    console.error("Cloudinary Delete Error:", error.message);
    return null;
  }
};

export { uploadOnCloudinary, deleteFromCloudinary };
