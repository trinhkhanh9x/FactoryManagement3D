import React from 'react';
export default function Page({ children, items = [] }) {
    return <header>{children ?? items.map((item) => item.label).join(' / ')}</header>;
}
