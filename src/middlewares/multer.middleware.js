import multer from "multer";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log("📁 Multer receiving file:", file.originalname);
    cb(null, "./public/temp");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileName = `${uniqueSuffix}-${file.originalname}`;
    console.log("📁 Multer saving as:", fileName);
    cb(null, fileName);
  },
});

export const upload = multer({
  storage,
});
