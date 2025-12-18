# Portfolio

## About the Portfolio
This portfolio showcases my work as an Interactive Media Design student, highlighting my skills in UX design, web development, and digital design. It features a SPA-like navigation experience with smooth page transitions, responsive design, and accessibility best practices.

---

## Pages

### Home
- Introduction and mission statement
- Call-to-action to view projects

### Projects
- **MealMate** - Student food planner UX case study with lo-fi and hi-fi Figma prototypes for mobile and tablet
- **Web Experiments** - Front-end demos including Pokedex API integration and other responsive web projects
- Live embedded Figma prototypes and website previews

### Resume
- About me section with profile
- Professional summary and experience (Freelance Designer at Cheetah Network)
- UX project experience
- Education (Algonquin College - Interactive Media Design)
- Skills, tools, and strengths
- Photography showcase with expandable cards

### Contact
- Contact form and information

---

## Key Features

### SPA-Like Navigation
- AJAX-based page loading without full page reloads
- LocalStorage caching for instant page revisits (1-hour cache duration)
- Parallel fetching during transition animations

### Page Transitions
- Animated wave transitions using GSAP
- Random direction variations (top, bottom, left, right)
- Smooth cover and reveal animations

### Performance Optimizations
- Lazy rendering for off-screen content
- Scroll-speed adaptive fade durations
- Preconnect hints for external resources
- Responsive images with `<picture>` elements

### Responsive Design
- Bootstrap 5.3.3 grid system
- Mobile-first approach
- Offcanvas navigation for smaller screens

---

## Development Process
The development began with wireframes in Figma, followed by HTML/CSS/Bootstrap implementation. The portfolio evolved to include advanced features like:

1. Custom page transition animations with GSAP
2. SPA navigation with localStorage caching
3. Lazy loading and scroll reveal effects
4. Embedded Figma prototype previews

---

## Challenges Faced and Solutions

1. **Page Transition Animation**
   - **Challenge**: Creating smooth transitions that work from different directions
   - **Solution**: SVG path morphing with GSAP, random direction selection, and proper positioning for each direction

2. **SPA Navigation**
   - **Challenge**: Avoiding full page reloads while maintaining functionality
   - **Solution**: AJAX fetching, content swapping, History API integration, and Bootstrap component reinitialization

3. **Bootstrap Component Reinitialization**
   - **Challenge**: Collapse and offcanvas components breaking after AJAX navigation
   - **Solution**: Manually reinitializing Bootstrap components after content swap

4. **Performance**
   - **Challenge**: Keeping the site fast with embedded iframes and animations
   - **Solution**: LocalStorage caching, lazy rendering, and parallel fetch/animation

---

## Lessons Learned

1. **Animation Libraries**: Gained experience with GSAP for complex SVG animations
2. **SPA Architecture**: Learned how to build SPA-like navigation without a framework
3. **Caching Strategies**: Implemented localStorage caching for improved UX
4. **History API**: Used pushState/popstate for proper browser navigation

---

## Assets and Resources Used

### Frameworks and Libraries
- [Bootstrap 5.3.3](https://getbootstrap.com/) - Responsive design and components
- [GSAP 3.12.5](https://greensock.com/gsap/) - Page transition animations
- [Hover.css](https://ianlunn.github.io/Hover/) - Hover effects

### Fonts
- [Roboto](https://fonts.google.com/specimen/Roboto) - Primary typography
- [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono) - Headings and accents

### Images
- Personal photography (all images are my own work)

### Icons
- [Bootstrap Icons](https://icons.getbootstrap.com/) - UI icons

### Tools
- [Figma](https://www.figma.com/) - Wireframes, prototypes, and UX design
- [Google Fonts](https://fonts.google.com/) - Font imports
- [Image Optimization Tools](https://classic.derivv.com/) - Image compression

---

## Project Links

- **MealMate Figma Prototype**: [View Complete Prototype](https://www.figma.com/proto/XwLlEgZSxto4KHpIDVK8XC/MealMate-App---Complete-Prototype)
- **Portfolio Wireframe**: [View Prototype](https://www.figma.com/design/cCyQPJAQAAVnwSVJKIGjeR/Portfolio-Prototype-Final?node-id=0-1&t=AhbJ9TyhS4ZcMxsh-1)

---

This portfolio represents my growth as a UX designer and front-end developer, combining user-centered design principles with modern web development techniques.