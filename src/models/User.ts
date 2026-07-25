import { Document, model, Schema, Types } from "mongoose";

const CredentialsSchema = {
    gcm_android_id: { type: String, required: true },
    gcm_security_token: { type: String, required: true },
    steam_id: { type: String, required: true },
    issued_date: { type: Number, required: true },
    expire_date: { type: Number, required: true },
    servers: [{ serverId: { type: String, required: true }, playerToken: { type: String, required: true } }]
};

const UserSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    credentials: CredentialsSchema,
}, { timestamps: true });

export class UserClass extends Document<Types.ObjectId> {
    userId!: string;
    credentials!: {
        gcm_android_id: string;
        gcm_security_token: string;
        steam_id: string;
        issued_date: number;
        expire_date: number;
        servers: {
            serverId: string;
            playerToken: string;
        }[];
    };
    createdAt!: Date;
    updatedAt!: Date;
}

UserSchema.loadClass(UserClass);

export const UserModel = model<UserClass>("User", UserSchema);