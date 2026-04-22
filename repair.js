// scratch/repair_locations.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./src/models/user.model.js";
dotenv.config();
async function fixDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find({});

        for (const user of users) {
            const lat = Number(user.latitude);
            const lng = Number(user.longitude);

            if (!isNaN(lat) && !isNaN(lng)) {
                // Correct coordinates to [Longitude, Latitude]
                user.location = {
                    type: "Point",
                    coordinates: [lng, lat]
                };
                user.latitude = lat;
                user.longitude = lng;
                await user.save({ validateBeforeSave: false });
                console.log(`Fixed location for: ${user.name}`);
            }
        }
        console.log("Database repair complete!");
        process.exit(0);
    } catch (err) {
        console.error(err);
    }
}
fixDatabase();