import { Color } from 'Molstar/mol-util/color';

export class Colours {
    private colours: Color[];
    private currentIndex: number;

    constructor() {
        // @ts-ignore
        this.colours = [0xffffff, 0x3377aa, 0xcc6633, 0x66aa33, 0xaa3366, 0x3366cc, 0xaa3333, 0x33aa99, 0x9966cc, 0x77aa33, 0xcc9966, 0x6699cc, 0xaa9933, 0x33aa55, 0xaa6633, 0x3399aa, 0xcc3333, 0x33cc99, 0x996633, 0x6699aa, 0xaa5533];
        this.currentIndex = 0;
    }

    getNextColor(offset = 0): Color {
        const index = this.currentIndex + offset;
        if (index < this.colours.length) {
            const colour = this.colours[index];
            this.currentIndex = this.currentIndex + 1;
            // this.currentIndex = (this.currentIndex + 1) % this.colours.length;
            return colour;
        } else {
            // Create a unique new color
            return this.generateUniqueColor();
        }
    }

    getNextColorHex(offset = 0): `#${string}` {
        const color = this.getNextColor(offset);
        return `#${color.toString(16).padStart(6, '0')}`;
    }

    private generateUniqueColor(): Color {
        // Generate a new color based on HSL color space
        const baseHue = 360 * Math.random(); // Random hue
        const hue = (baseHue + (this.currentIndex * 137.508)) % 360; // Golden angle
        const saturation = 90 + Math.random() * 10; // Adjust saturation for variation
        const lightness = 50 + Math.random() * 10; // Adjust lightness for variation

        // Convert HSL to RGB
        const c = (1 - Math.abs((2 * lightness) - 1)) * saturation / 100;
        const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
        const m = lightness / 100 - c / 2;
        let red: number, green: number, blue: number;

        if (hue >= 0 && hue < 60) {
            [red, green, blue] = [c, x, 0];
        } else if (hue >= 60 && hue < 120) {
            [red, green, blue] = [x, c, 0];
        } else if (hue >= 120 && hue < 180) {
            [red, green, blue] = [0, c, x];
        } else if (hue >= 180 && hue < 240) {
            [red, green, blue] = [0, x, c];
        } else if (hue >= 240 && hue < 300) {
            [red, green, blue] = [x, 0, c];
        } else {
            [red, green, blue] = [c, 0, x];
        }

        // Adjust RGB values and convert to integer
        red = Math.round((red + m) * 255);
        green = Math.round((green + m) * 255);
        blue = Math.round((blue + m) * 255);

        return Color.fromRgb(red, green, blue);
    }
}