declare module "bun" {
    interface Env {
        TOKEN: string;
        PORT: number;
        HOST: string;
        OAUTH_SECRET: string;
        PROTOCOL: string;
        MONGODB_URI: string;
    }
}