// Photographs and illustrations shown inside scenes. Captions and alt text live in i18n (images.<id>).
import { el } from './ui.js';
import { t } from './i18n.js';

let byId = new Map();

export function setImages(list) {
    byId = new Map(list.map(img => [img.id, img]));
}

export const allImages = () => [...byId.values()];

export function figure(id, { eager = false } = {}) {
    const img = byId.get(id);
    if (!img) return null;
    const text = t(`images.${id}`);
    const pic = el('img', {
        src: img.file,
        width: img.width,
        height: img.height,
        alt: text.alt,
        loading: eager ? 'eager' : 'lazy',
        decoding: 'async',
    });
    const credit = img.kind === 'photo'
        ? el('a', { href: img.page, target: '_blank', rel: 'noopener noreferrer' },
            t('image.photoCredit', { creator: img.creatorShort || img.creator, license: img.license }))
        : el('span', {}, t('image.illustration'));
    const fig = el('figure', { class: `scene-figure ${img.kind}` },
        pic,
        el('figcaption', {}, el('span', { class: 'cap' }, text.caption), el('span', { class: 'credit' }, credit)),
    );
    // If the file does not load, keep the caption and drop the empty frame.
    pic.addEventListener('error', () => {
        pic.remove();
        fig.classList.add('missing');
        fig.querySelector('.cap').append(` ${t('image.missing')}`);
    });
    return fig;
}
