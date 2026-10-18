// Song data for Dino Beat. Each bar is 16 steps (sixteenth notes).
// Melody: digits 0-9 are steps on a minor pentatonic scale, "-" holds the previous note, "." is a rest.
// Drums: "x" is a hit. Bass: "x" root, "o" octave up, "5" fifth, "." rest.
(function () {
    const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

    const DRUMS = {
        intro: { kick: 'x.......x.......', snare: '................', hat: '..x...x...x...x.' },
        a: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
        b: { kick: 'x..x..x.x..x..x.', snare: '....x.......x.x.', hat: 'xxxxxxxxxxxxxxxx' },
        fill: { kick: 'x...x...x.x.x.xx', snare: '....x...x.x.xxxx', hat: 'x.x.x.x.........' },
        end: { kick: 'x...............', snare: 'x...............', hat: '................' },
        r: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x' },
        r2: { kick: 'x.x.x...x.x.x..x', snare: '....x..x....x...', hat: 'x.x.x.x.x.x.x.x.' },
        rfill: { kick: 'x.x.x.x.x.x.x.x.', snare: '....x.x.xxxxxxxx', hat: '................' },
    };

    function section(drums, bass, melodies, chords) {
        return melodies.map((m, i) => ({
            d: Array.isArray(drums) ? drums[i % drums.length] : drums,
            b: bass,
            m,
            c: chords[i % chords.length],
        }));
    }

    const volcanoMel = {
        A1: '5.5.6.5.3...2.3.',
        A2: '5.5.6.8.9...8.6.',
        A3: '5.5.6.5.3...2.0.',
        A4: '2.3.5.3.2...0...',
        B1: '8...9...8.6.5...',
        B2: '6...8...6.5.3...',
        B3: '5.6.8.9.8.6.5.6.',
        B4: '8---..9.8...5...',
        End: '5---------------',
    };

    const raptorMel = {
        A1: '0.3.5.3.6.5.3.2.',
        A2: '0.3.5.6.8.6.5.3.',
        A3: '5.6.5.3.2.3.2.0.',
        A4: '3.2.0...0.2.3...',
        B1: '8.8.6.8.9.8.6.5.',
        B2: '6.6.5.6.8.6.5.3.',
        B3: '5.5.3.5.6.5.3.2.',
        B4: '3.5.6.8.9---9...',
        End: '0---------------',
    };

    const A = ['A1', 'A2', 'A3', 'A4', 'A1', 'A2', 'A3', 'A4'];
    const B = ['B1', 'B2', 'B3', 'B4', 'B1', 'B2', 'B3', 'B4'];
    const eight = (last) => ['a', 'a', 'a', 'a', 'a', 'a', 'a', last];

    window.DINO_BEAT_SONGS = [
        {
            id: 'volcano',
            title: 'Volcano Groove',
            artist: 'T-Rex & The Lava Lamps',
            bpm: 112,
            leadRoot: 57,
            scale: PENTA,
            bassRoots: { Am: 45, F: 41, C: 48, G: 43, Em: 40 },
            bassPatterns: { a: 'x.o.x.o.x.o.x.o.', b: 'x..x..o.x..x..5.' },
            melodies: volcanoMel,
            drums: DRUMS,
            bars: [
                ...section(['intro', 'intro', 'intro', 'fill'], null, [null, null, null, null], ['Am']),
                ...section(eight('fill'), 'a', A, ['Am', 'F', 'C', 'G']),
                ...section(['b', 'b', 'b', 'b', 'b', 'b', 'b', 'fill'], 'b', B, ['F', 'G', 'Am', 'Am']),
                ...section(eight('fill'), 'a', A, ['Am', 'F', 'C', 'G']),
                ...section(['a', 'a', 'fill', 'end'], 'a', ['A1', 'A4', null, 'End'], ['Am', 'F', 'G', 'Am']),
            ],
        },
        {
            id: 'raptor',
            title: 'Raptor Rush',
            artist: 'Velociraptor Velocity',
            bpm: 148,
            leadRoot: 64,
            scale: PENTA,
            bassRoots: { Em: 40, C: 36, G: 43, D: 38 },
            bassPatterns: { a: 'xxo.xxo.xxo.x.o.', b: 'x.x.o.x.x.x.o.5.' },
            melodies: raptorMel,
            drums: DRUMS,
            bars: [
                ...section(['r', 'r', 'r', 'rfill'], 'a', [null, null, null, null], ['Em', 'C', 'G', 'D']),
                ...section(['r', 'r', 'r', 'r', 'r', 'r', 'r', 'rfill'], 'a', A, ['Em', 'C', 'G', 'D']),
                ...section(['r2', 'r2', 'r2', 'r2', 'r2', 'r2', 'r2', 'rfill'], 'b', B, ['C', 'D', 'Em', 'Em']),
                ...section(['r', 'r', 'r', 'r', 'r', 'r', 'r', 'rfill'], 'a', A, ['Em', 'C', 'G', 'D']),
                ...section(['r2', 'r2', 'r2', 'r2', 'r2', 'r2', 'r2', 'rfill'], 'b', B, ['C', 'D', 'Em', 'Em']),
                ...section(['r', 'r', 'rfill', 'end'], 'a', ['A1', 'A4', null, 'End'], ['Em', 'C', 'D', 'Em']),
            ],
        },
    ];
})();
