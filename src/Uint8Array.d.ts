
// declare Uint8Array.prototype.toBase64()

declare interface Uint8Array {
    toBase64(options: {urlSafe: boolean, omitPadding: boolean}): string;
}

