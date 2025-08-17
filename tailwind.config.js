/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}", // 扫描所有组件和页面
    ],
    theme: {
        extend: {
            colors: {
                primary: '#4f46e5',    // Demo 的主色
                secondary: '#10b981',  // 成功/正向状态颜色
                danger: '#ef4444',     // 错误/删除状态颜色
                background: '#f9fafb', // 页面背景色
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'], // 可替换为你的首选字体
                mono: ['Fira Code', 'monospace'],
            },
        },
    },
    plugins: [],
};
