import { Color } from 'Molstar/mol-util/color';

export class Colours {
    private colours: Color[];
    private currentIndex: number;

    constructor() {
        // @ts-ignore
        this.colours = [0xffffff, 0x3377aa, 0xcc6633, 0x66aa33, 0xaa3366, 0x3366cc, 0xaa3333, 0x33aa99, 0x9966cc, 0x77aa33, 0xcc9966, 0x6699cc, 0xaa9933, 0x33aa55, 0xaa6633, 0x3399aa, 0xcc3333, 0x33cc99, 0x996633, 0x6699aa, 0xaa5533];
        this.currentIndex = 0;
    }

    getNextColor(): Color {
        const colour = this.colours[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.colours.length;
        return colour;
    }
}