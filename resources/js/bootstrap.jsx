import styles from './styles.css?inline';

if (!document.getElementById('fm3d-module-style')) {
    const style = document.createElement('style');
    style.id = 'fm3d-module-style';
    style.textContent = styles;
    document.head.appendChild(style);
}
