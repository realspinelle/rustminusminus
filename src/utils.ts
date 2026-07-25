export async function asyncFilter<T>(
    arr: T[],
    predicate: (item: T) => Promise<boolean>
): Promise<T[]> {
    const results = await Promise.all(arr.map(predicate));
    return arr.filter((_, index) => results[index]);
}
export function getRandomHexColor(withHash: boolean = false): string {
    const color = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    return withHash ? `#${color}` : color;
}
