document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');
    const body = document.body;

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
            body.classList.toggle('menu-open');
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
                body.classList.remove('menu-open');
            });
        });
    }

    // Navbar scroll effect
    // Navbar scroll effect
    let lastScrollTop = 0;
    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {
        let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop > lastScrollTop && scrollTop > 500) { // Scroll Down & past threshold
            navbar.classList.add('navbar-hidden');
            navbar.classList.remove('scrolled'); // Optional: remove shadow if hidden
        } else { // Scroll Up
            navbar.classList.remove('navbar-hidden');
            if (scrollTop > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    });

    // ===== Slideshow =====
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const track = document.querySelector('.slideshow-track');
    let currentSlide = 0;
    let slideInterval;

    function goToSlide(index) {
        currentSlide = index;
        if (track) {
            track.style.transform = `translateX(-${currentSlide * 100}vw)`;
        }
        dots.forEach((d, i) => {
            d.classList.toggle('active', i === currentSlide);
        });
    }

    function nextSlide() {
        goToSlide((currentSlide + 1) % slides.length);
    }

    function prevSlide() {
        goToSlide((currentSlide - 1 + slides.length) % slides.length);
    }

    function startAutoSlide() {
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, 3000);
    }

    function stopAutoSlide() {
        clearInterval(slideInterval);
        slideInterval = null;
    }

    if (slides.length > 0) {
        // Arrow Click
        const prevBtn = document.querySelector('.prev');
        const nextBtn = document.querySelector('.next');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                stopAutoSlide();
                prevSlide();
                startAutoSlide();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                stopAutoSlide();
                nextSlide();
                startAutoSlide();
            });
        }

        // Dot click
        dots.forEach(dot => {
            dot.addEventListener('click', () => {
                stopAutoSlide();
                goToSlide(parseInt(dot.dataset.index));
                startAutoSlide();
            });
        });

        // Pause on hover
        const container = document.querySelector('.slideshow-container');
        if (container) {
            container.addEventListener('mouseenter', stopAutoSlide);
            container.addEventListener('mouseleave', startAutoSlide);
        }

        startAutoSlide();
    }

    // Scroll to Top Button
    const scrollTopBtn = document.getElementById('scrollToTop');

    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollTopBtn.classList.add('visible');
            } else {
                scrollTopBtn.classList.remove('visible');
            }
        });

        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
});
