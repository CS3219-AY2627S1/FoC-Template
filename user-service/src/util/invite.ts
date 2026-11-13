
export interface InviteCodeInfo {
    code: string,
    expiresAt: Date
}

export interface IInviteCodeGenerator {
    /**
     * Generates a unique code and along with its expiry time
     * 
     * @param expiryTime time in seconds from now that this code will no longer be valid
     */
    generateCode(expiryTime: number): InviteCodeInfo;
}

const S_TO_MS = 1000;
export const defaultInviteCodeGenerator: IInviteCodeGenerator = {
    generateCode(expiryTime: number) {
        const now = Date.now();
        const expiresAtEpoch = now + expiryTime * S_TO_MS;
        const expiresAt = new Date(expiresAtEpoch);
        const code = crypto.randomUUID();
        return { code, expiresAt };
    }
};

