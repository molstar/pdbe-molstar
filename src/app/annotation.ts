/**
 * Copyright (c) 2019-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

 import { CustomElementProperty } from 'Molstar/mol-model-props/common/custom-element-property';
 import { Model, ElementIndex, ResidueIndex } from 'Molstar/mol-model/structure';
 import { Color } from 'Molstar/mol-util/color';
 import { CustomProperty } from 'Molstar/mol-model-props/common/custom-property';

 /*const ShannonEntropyPalette: Color[] = [
     [255, 255, 129], // insufficient
     [160, 37, 96], // 9
     [240, 125, 171],
     [250, 201, 222],
     [252, 237, 244],
     [255, 255, 255],
     [234, 255, 255],
     [215, 255, 255],
     [140, 255, 255],
     [16, 200, 209] // 1
 ].reverse().map(([r, g, b]) => Color.fromRgb(r, g, b));*/
 const ShannonEntropyPalette: Color[] = [[13,8,135], [19,7,137], [27,6,141], [33,6,143], [38,5,146], [43,5,148], [47,5,150], [53,4,152], [56,4,154], [61,4,156], [65,4,157], [70,3,159], [74,3,160], [78,2,162], [82,2,163], [86,2,164], [91,1,165], [94,1,166], [99,0,167], [102,0,167], [107,0,168], [110,0,168], [114,1,168], [118,1,168], [122,2,168], [126,3,168], [129,4,167], [134,6,167], [136,8,166], [141,11,164], [144,14,163], [148,16,162], [151,19,160], [154,22,159], [158,25,157], [161,28,155], [165,31,153], [167,33,151], [171,36,148], [174,39,146], [177,42,144], [180,45,142], [182,48,139], [185,51,137], [188,53,135], [191,57,132], [193,59,130], [196,62,127], [198,65,125], [201,68,122], [203,71,120], [205,74,118], [208,77,116], [210,79,113], [212,83,111], [214,85,109], [217,88,106], [219,91,104], [221,94,102], [223,97,100], [225,100,98], [227,103,95], [228,106,93], [231,110,91], [232,112,89], [234,116,87], [236,119,84], [237,122,82], [239,125,80], [240,128,78], [242,131,76], [243,135,74], [245,138,71], [246,141,69], [247,145,67], [248,148,65], [249,152,62], [250,156,60], [251,159,58], [251,163,56], [252,166,54], [253,171,52], [253,174,50], [253,178,47], [253,181,46], [254,186,44], [253,190,42], [253,194,41], [253,198,39], [253,202,38], [252,207,37], [252,210,37], [251,215,36], [250,218,36], [248,223,37], [247,227,37], [246,232,38], [244,236,39], [243,240,39], [241,245,37] ].map(([r, g, b]) => Color.fromRgb(r, g, b));
 const ShannonEntropyDefaultColor = Color(0x999999);
 const CustomDataPalette: Color[] = [ 
    [68, 1, 84],
    [69, 4, 87],
    [70, 8, 92],
    [71, 13, 96],
    [71, 16, 99],
    [72, 20, 103],
    [72, 23, 105],
    [72, 27, 109],
    [72, 30, 111],
    [72, 33, 114],
    [72, 36, 117],
    [72, 40, 120],
    [71, 44, 122],
    [71, 46, 124],
    [70, 50, 126],
    [70, 52, 128],
    [69, 56, 130],
    [68, 58, 131],
    [67, 62, 133],
    [66, 64, 134],
    [65, 68, 135],
    [63, 71, 136],
    [62, 73, 137],
    [61, 77, 138],
    [60, 79, 138],
    [59, 82, 139],
    [58, 84, 139],
    [56, 87, 140],
    [55, 90, 141],
    [54, 93, 141],
    [52, 96, 141],
    [51, 98, 141],
    [50, 101, 142],
    [49, 103, 142],
    [48, 106, 142],
    [47, 108, 142],
    [46, 111, 142],
    [45, 112, 142],
    [44, 116, 142],
    [43, 118, 142],
    [42, 120, 142],
    [41, 123, 142],
    [40, 125, 142],
    [39, 128, 142],
    [38, 130, 142],
    [37, 132, 142],
    [36, 134, 142],
    [35, 137, 142],
    [34, 140, 141],
    [33, 142, 141],
    [33, 145, 141],
    [32, 146, 140],
    [31, 149, 139],
    [31, 151, 139],
    [31, 154, 138],
    [30, 156, 137],
    [31, 159, 136],
    [31, 161, 135],
    [32, 163, 134],
    [33, 166, 133],
    [34, 168, 132],
    [36, 171, 130],
    [38, 173, 129],
    [41, 175, 127],
    [44, 177, 126],
    [47, 180, 124],
    [52, 182, 121],
    [55, 184, 120],
    [59, 187, 117],
    [63, 188, 115],
    [68, 191, 112],
    [72, 193, 110],
    [78, 195, 107],
    [82, 197, 105],
    [88, 199, 101],
    [92, 200, 99],
    [98, 203, 95],
    [105, 205, 91],
    [110, 206, 88],
    [117, 208, 84],
    [122, 209, 81],
    [129, 211, 77],
    [134, 212, 73],
    [142, 214, 69],
    [147, 215, 65],
    [155, 217, 60],
    [162, 219, 55],
    [168, 219, 52],
    [176, 221, 47],
    [181, 222, 43],
    [189, 223, 38],
    [194, 223, 35],
    [202, 225, 31],
    [208, 225, 28],
    [216, 226, 26],
    [223, 227, 24],
    [228, 228, 24],
    [236, 229, 27],
    [241, 230, 29],
    [248, 231, 33]
    
].map(([r, g, b]) => Color.fromRgb(r, g, b));
 const CustomDataDefaultColor = Color(0x999999);

 const TwinConsPalette: Color[] = [
    [8, 48, 107],
[8, 51, 112],
[8, 55, 118],
[8, 58, 122],
[8, 62, 127],
[8, 65, 133],
[8, 69, 138],
[8, 73, 143],
[8, 76, 148],
[8, 80, 154],
[10, 83, 158],
[12, 86, 160],
[15, 90, 163],
[18, 93, 165],
[20, 96, 168],
[23, 100, 171],
[25, 103, 174],
[28, 107, 176],
[31, 110, 179],
[34, 114, 181],
[37, 117, 183],
[41, 121, 185],
[44, 124, 187],
[48, 128, 189],
[51, 131, 190],
[55, 135, 192],
[58, 139, 194],
[62, 142, 196],
[65, 145, 198],
[70, 149, 199],
[74, 152, 201],
[78, 154, 203],
[83, 158, 205],
[87, 160, 206],
[92, 164, 208],
[96, 167, 210],
[101, 170, 211],
[105, 173, 213],
[109, 175, 214],
[115, 178, 216],
[121, 182, 217],
[126, 184, 218],
[132, 188, 219],
[137, 190, 220],
[143, 194, 222],
[148, 196, 223],
[153, 199, 224],
[159, 202, 225],
[162, 204, 227],
[167, 206, 228],
[171, 208, 230],
[176, 210, 231],
[180, 211, 233],
[184, 213, 234],
[189, 215, 236],
[193, 217, 237],
[197, 218, 239],
[200, 220, 240],
[202, 222, 241],
[205, 224, 241],
[208, 225, 242],
[210, 227, 243],
[213, 229, 244],
[215, 231, 245],
[218, 232, 246],
[220, 234, 247],
[223, 236, 247],
[226, 237, 248],
[228, 239, 249],
[231, 241, 250],
[234, 243, 251],
[237, 244, 252],
[239, 246, 252],
[242, 248, 253],
[245, 249, 254],
[255, 245, 240],
[255, 238, 231],
[254, 232, 221],
[254, 225, 211],
[253, 213, 196],
[253, 202, 181],
[252, 190, 165],
[252, 178, 150],
[252, 164, 135],
[252, 151, 119],
[252, 138, 106],
[251, 125, 93],
[251, 112, 80],
[249, 99, 69],
[245, 83, 59],
[241, 68, 50],
[235, 55, 42],
[223, 43, 37],
[211, 32, 32],
[200, 23, 28],
[188, 20, 26],
[176, 18, 23],
[162, 14, 21],
[142, 9, 18],
[122, 5, 16]
].reverse().map(([r, g, b]) => Color.fromRgb(r, g, b));
 const TwinConsDefaultColor = Color(0x999999);


var data:any = []
let check = function() {
    setTimeout(function () {
      if (!(window as any).getAnnotationArray) 
        check();
      else {
        let getAnnotationArray = (window as any).getAnnotationArray;
        if (getAnnotationArray().length == 0) {
            check();
        } else {
            data = getAnnotationArray()
        }
      }
    }, 1000);
  };
  check();

 export const ShannonEntropy = CustomElementProperty.create<number>({
     name: 'shannon-entropy-wrapper',
     label: 'Shannon Entropy',
     type: 'static',

     async getData(model: Model, ctx: CustomProperty.Context) {
         const conservationMap = new Map<string, number>();
         const annotations = data['SE'];
         for (const e of annotations) {
             for (const r of e.ids) {
                 conservationMap.set(r, e.annotation);
             }
         }
         const map = new Map<ElementIndex, number>();
         const { _rowCount: residueCount } = model.atomicHierarchy.residues;
         const { offsets: residueOffsets } = model.atomicHierarchy.residueAtomSegments;
         const chainIndex = model.atomicHierarchy.chainAtomSegments.index;

         for (let rI = 0 as ResidueIndex; rI < residueCount; rI++) {
             const cI = chainIndex[residueOffsets[rI]];
             const key = `${model.atomicHierarchy.chains.auth_asym_id.value(cI)} ${model.atomicHierarchy.residues.auth_seq_id.value(rI)}`;

             if (!conservationMap.has(key)) continue;
             const ann = conservationMap.get(key)!;
             for (let aI = residueOffsets[rI]; aI < residueOffsets[rI + 1]; aI++) {
                 map.set(aI, ann);
             }
         }
         return { value: map };
     },
     coloring: {
         getColor(e: number) {
             if (e < 1 || e > 100) return ShannonEntropyDefaultColor;
             return ShannonEntropyPalette[e - 1];
         },
         defaultColor: ShannonEntropyDefaultColor
     },
     getLabel(e) {
         if (e === 100) return `Evolutionary Conservation: Insufficient Data`;
         return e ? `Evolutionary Conservation: ${e}` : void 0;
     },
 });

 export const TwinConsData = CustomElementProperty.create<number>({
    name: 'TwinCons-Data-wrapper',
    label: 'Twin Cons',
    type: 'static',

    async getData(model: Model, ctx: CustomProperty.Context) {
        const conservationMap = new Map<string, number>();
        const annotations = data['TWC'];
        for (const e of annotations) {
            for (const r of e.ids) {
                conservationMap.set(r, e.annotation);
            }
        }
        const map = new Map<ElementIndex, number>();
        const { _rowCount: residueCount } = model.atomicHierarchy.residues;
        const { offsets: residueOffsets } = model.atomicHierarchy.residueAtomSegments;
        const chainIndex = model.atomicHierarchy.chainAtomSegments.index;

        for (let rI = 0 as ResidueIndex; rI < residueCount; rI++) {
            const cI = chainIndex[residueOffsets[rI]];
            const key = `${model.atomicHierarchy.chains.auth_asym_id.value(cI)} ${model.atomicHierarchy.residues.auth_seq_id.value(rI)}`;

            if (!conservationMap.has(key)) continue;
            const ann = conservationMap.get(key)!;
            for (let aI = residueOffsets[rI]; aI < residueOffsets[rI + 1]; aI++) {
                map.set(aI, ann);
            }
        }
        return { value: map };
    },
    coloring: {
        getColor(e: number) {
            if (e < 1 || e > 100) return TwinConsDefaultColor;
            return TwinConsPalette[e - 1];
        },
        defaultColor: TwinConsDefaultColor
    },
    getLabel(e) {
        if (e === 100) return `Evolutionary Conservation: Insufficient Data`;
        return e ? `Evolutionary Conservation: ${e}` : void 0;
    },
});

export const CustomData = CustomElementProperty.create<number>({
    name: 'custom-data-wrapper',
    label: 'Custome Data',
    type: 'static',

    async getData(model: Model, ctx: CustomProperty.Context) {
        const conservationMap = new Map<string, number>();
        const annotations = data['CD'];
        for (const e of annotations) {
            for (const r of e.ids) {
                conservationMap.set(r, e.annotation);
            }
        }
        const map = new Map<ElementIndex, number>();
        const { _rowCount: residueCount } = model.atomicHierarchy.residues;
        const { offsets: residueOffsets } = model.atomicHierarchy.residueAtomSegments;
        const chainIndex = model.atomicHierarchy.chainAtomSegments.index;

        for (let rI = 0 as ResidueIndex; rI < residueCount; rI++) {
            const cI = chainIndex[residueOffsets[rI]];
            const key = `${model.atomicHierarchy.chains.auth_asym_id.value(cI)} ${model.atomicHierarchy.residues.auth_seq_id.value(rI)}`;

            if (!conservationMap.has(key)) continue;
            const ann = conservationMap.get(key)!;
            for (let aI = residueOffsets[rI]; aI < residueOffsets[rI + 1]; aI++) {
                map.set(aI, ann);
            }
        }
        return { value: map };
    },
    coloring: {
        getColor(e: number) {
            if (e < 1 || e > 100) return CustomDataDefaultColor;
            return CustomDataPalette[e - 1];
        },
        defaultColor: CustomDataDefaultColor
    },
    getLabel(e) {
        if (e === 100) return `Evolutionary Conservation: Insufficient Data`;
        return e ? `Evolutionary Conservation: ${e}` : void 0;
    },
});
